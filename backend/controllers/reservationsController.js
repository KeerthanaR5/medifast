const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Stock = require('../models/Stock');
const Pharmacy = require('../models/Pharmacy');

const TTL_MINUTES = parseInt(process.env.RESERVATION_TTL_MINUTES || '120', 10);

function isOwnerOrAdmin(user, pharmacy) {
  if (!user || !pharmacy) return false;
  return String(pharmacy.owner) === String(user._id) || user.role === 'admin';
}

async function findStockDoc({ pharmacyId, medicineId, medicineName }) {
  const filter = { pharmacy: pharmacyId };
  if (medicineId) {
    filter.medicine = medicineId;
  } else if (medicineName) {
    filter.medicineName = medicineName.trim();
  } else {
    return null;
  }
  return await Stock.findOne(filter);
}

// POST /api/reservations
// body: { pharmacyId, medicineId?, medicineName?, quantity }
async function createReservation(req, res) {
  try {
    const userId = req.user?._id;
    const { pharmacyId, medicineId, medicineName } = req.body || {};
    const quantity = Number(req.body?.quantity);

    if (!mongoose.isValidObjectId(pharmacyId)) {
      return res.status(400).json({ success: false, message: 'Invalid pharmacyId' });
    }
    if ((!medicineId && !medicineName) || !(Number.isSafeInteger(quantity) && quantity > 0)) {
      return res.status(400).json({ success: false, message: 'Provide medicineId or medicineName and a positive whole-number quantity' });
    }

    // Reservations are allowed only at manually verified pharmacies.
    const pharmacy = await Pharmacy.findById(pharmacyId).select('verified');

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    if (pharmacy.verified !== 'manual') {
      return res.status(403).json({
        success: false,
        message: 'Reservations are available only at verified pharmacies'
      });
    }

    const stockDoc = await findStockDoc({ pharmacyId, medicineId, medicineName });
    if (!stockDoc) {
      return res.status(404).json({ success: false, message: 'Stock item not found' });
    }

    // Atomic decrement
    const dec = await Stock.findOneAndUpdate(
      { _id: stockDoc._id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity }, $set: { lastUpdated: new Date() } },
      { new: true }
    );

    if (!dec) {
      return res.status(409).json({ success: false, message: 'Insufficient stock' });
    }

    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
    const reservation = new Reservation({
      user: userId,
      stock: stockDoc._id,
      quantity,
      status: 'pending',
      expiresAt,
    });

    try {
      await reservation.save();
    } catch (saveErr) {
      // rollback decrement on failure to create reservation
      await Stock.updateOne(
        { _id: stockDoc._id },
        { $inc: { quantity: quantity }, $set: { lastUpdated: new Date() } }
      );
      throw saveErr;
    }

    res.status(201).json({ success: true, data: { id: reservation._id, status: reservation.status, expiresAt } });
  } catch (e) {
    console.error('createReservation error', e);
    res.status(500).json({ success: false, message: 'Failed to create reservation' });
  }
}

// GET /api/reservations (list my reservations)
async function listMyReservations(req, res) {
  try {
    const items = await Reservation.find({ user: req.user?._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'stock', populate: [
        { path: 'medicine', select: 'name generic_name' },
        { path: 'pharmacy', select: 'name address verified' },
      ]})
      .lean();

    const data = items.map(r => ({
      _id: r._id,
      status: r.status,
      quantity: r.quantity,
      reservedAt: r.reservedAt || r.createdAt,
      expiresAt: r.expiresAt,
      pharmacy: r.stock?.pharmacy ? { _id: r.stock.pharmacy._id, name: r.stock.pharmacy.name } : null,
      medicine: r.stock?.medicine ? { _id: r.stock.medicine._id, name: r.stock.medicine.name, generic_name: r.stock.medicine.generic_name } : { name: r.stock?.medicineName || 'Unknown' },
    }));

    res.json({ success: true, count: data.length, data });
  } catch (e) {
    console.error('listMyReservations error', e);
    res.status(500).json({ success: false, message: 'Failed to list reservations' });
  }
}

// PATCH /api/reservations/:id/confirm  (pharmacy owner/admin)
async function confirmReservation(req, res) {
  try {
    const r = await Reservation.findById(req.params.id).populate({ path: 'stock', populate: { path: 'pharmacy', select: 'owner' } });
    if (!r) return res.status(404).json({ success: false, message: 'Reservation not found' });

    const ph = r.stock?.pharmacy;
    if (!ph || !isOwnerOrAdmin(req.user, ph)) {
      return res.status(403).json({ success: false, message: 'Not authorized to confirm' });
    }
    if (r.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot confirm a ${r.status} reservation` });
    }

    const updated = await Reservation.findOneAndUpdate(
      { _id: r._id, status: 'pending' },
      { $set: { status: 'confirmed' } },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ success: false, message: 'Reservation status changed, retry' });
    }

    res.json({ success: true, data: { id: updated._id, status: updated.status } });
  } catch (e) {
    console.error('confirmReservation error', e);
    res.status(500).json({ success: false, message: 'Failed to confirm reservation' });
  }
}

// PATCH /api/reservations/:id/cancel  (customer or pharmacy owner/admin)
async function cancelReservation(req, res) {
  try {
    const r = await Reservation.findById(req.params.id).populate({ path: 'stock', populate: { path: 'pharmacy', select: 'owner' } });
    if (!r) return res.status(404).json({ success: false, message: 'Reservation not found' });

    const canCancelAsUser = String(r.user) === String(req.user?._id);
    const ph = r.stock?.pharmacy;
    const canCancelAsOwner = ph && isOwnerOrAdmin(req.user, ph);

    if (!canCancelAsUser && !canCancelAsOwner) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel' });
    }
        // A reservation cannot be canceled after medicine pickup.
    if (r.status === 'picked_up') {
      return res.status(400).json({
        success: false,
        message: 'A picked-up reservation cannot be canceled'
      });
    }
    if (r.status === 'pending') {
      // Try to set to canceled only if still pending
      const updated = await Reservation.findOneAndUpdate(
        { _id: r._id, status: 'pending' },
        { $set: { status: 'canceled' } },
        { new: true }
      );
      if (!updated) {
        return res.status(409).json({ success: false, message: 'Reservation status changed, retry' });
      }
      // Restore stock
      await Stock.updateOne(
        { _id: r.stock._id },
        { $inc: { quantity: r.quantity }, $set: { lastUpdated: new Date() } }
      );
      return res.json({ success: true, data: { id: updated._id, status: updated.status } });
    } else {
      // No stock change for non-pending
      if (r.status === 'canceled' || r.status === 'expired') {
        return res.json({ success: true, data: { id: r._id, status: r.status } });
      }
      const updated = await Reservation.findOneAndUpdate(
        { _id: r._id },
        { $set: { status: 'canceled' } },
        { new: true }
      );
      if (r.status === 'confirmed') {
        await Stock.updateOne(
          { _id: r.stock._id },
          { $inc: { quantity: r.quantity }, $set: { lastUpdated: new Date() } }
        );
      }
      return res.json({ success: true, data: { id: updated._id, status: updated.status } });
    }
  } catch (e) {
    console.error('cancelReservation error', e);
    res.status(500).json({ success: false, message: 'Failed to cancel reservation' });
  }
}

// PATCH /api/reservations/:id/pickup  (pharmacy owner/admin)
async function pickupReservation(req, res) {
  try {
    const r = await Reservation.findById(req.params.id).populate({ path: 'stock', populate: { path: 'pharmacy', select: 'owner' } });
    if (!r) return res.status(404).json({ success: false, message: 'Reservation not found' });

    const ph = r.stock?.pharmacy;
    if (!ph || !isOwnerOrAdmin(req.user, ph)) {
      return res.status(403).json({ success: false, message: 'Not authorized to mark pickup' });
    }
    if (r.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: `Only confirmed reservations can be marked picked up (current: ${r.status})` });
    }

    const updated = await Reservation.findOneAndUpdate(
      { _id: r._id, status: 'confirmed' },
      { $set: { status: 'picked_up' } },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ success: false, message: 'Reservation status changed, retry' });
    }

    res.json({ success: true, data: { id: updated._id, status: updated.status } });
  } catch (e) {
    console.error('pickupReservation error', e);
    res.status(500).json({ success: false, message: 'Failed to mark pickup' });
  }
}

module.exports = { createReservation, confirmReservation, cancelReservation, pickupReservation, listMyReservations };
