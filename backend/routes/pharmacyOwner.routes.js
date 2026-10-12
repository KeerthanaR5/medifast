const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticateToken } = require('../middlewares/authenticateToken');
const { requireRoles } = require('../middlewares/roleAuth');
const { getMine, getPharmacyInfo, getStock, upsertStock, bulkUpsertStock, deleteStock, updateLocation, ownerDashboard, updateProfile, listMineReservations } = require('../controllers/pharmacyOwnerController');

// Protect endpoints for pharmacy owners and admins
router.use(authenticateToken, requireRoles('pharmacy', 'admin'));

// Owner info
router.get('/mine', getMine);
router.get('/mine/dashboard', ownerDashboard);
router.get('/mine/reservations', listMineReservations);
router.get('/:id', getPharmacyInfo);

// Stock management
router.get('/:id/stock', getStock);
router.post('/:id/stock', upsertStock);
router.post('/:id/stock/bulk', bulkUpsertStock);
router.delete('/:id/stock/:stockId', deleteStock);

// Location update
router.put('/:id/location', updateLocation);
// Profile update
router.put('/:id/profile', updateProfile);

module.exports = router;
