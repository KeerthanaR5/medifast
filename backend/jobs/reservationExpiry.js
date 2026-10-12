const Reservation = require('../models/Reservation');
const Stock = require('../models/Stock');

async function sweepOnce() {
  const now = new Date();
  const expired = await Reservation.find({ status: 'pending', expiresAt: { $lte: now } }).limit(200).lean();
  for (const r of expired) {
    const updated = await Reservation.findOneAndUpdate(
      { _id: r._id, status: 'pending' },
      { $set: { status: 'expired' } },
      { new: true }
    );
    if (updated) {
      await Stock.updateOne(
        { _id: r.stock },
        { $inc: { quantity: r.quantity }, $set: { lastUpdated: new Date() } }
      );
    }
  }
}

function startReservationExpiryJob() {
  const intervalMs = parseInt(process.env.RESERVATION_SWEEP_INTERVAL_MS || '60000', 10);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await sweepOnce(); }
    catch (e) { console.error('reservationExpiry job error:', e.message); }
    finally { running = false; }
  }, intervalMs);
}

module.exports = { startReservationExpiryJob, sweepOnce };
