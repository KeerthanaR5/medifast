const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authenticateToken');
const { requireRoles } = require('../middlewares/roleAuth');
const { listPending, getPharmacyDetail, approvePharmacy, rejectPharmacy, getAudit } = require('../controllers/adminController');

// Protect all with admin role
router.use(authenticateToken, requireRoles('admin'));

// GET /api/admin/pharmacies/pending
router.get('/pharmacies/pending', listPending);

// GET /api/admin/pharmacies/:id
router.get('/pharmacies/:id', getPharmacyDetail);

// PATCH / PUT /api/admin/pharmacies/:id/approve
router.patch('/pharmacies/:id/approve', approvePharmacy);
router.put('/pharmacies/:id/approve', approvePharmacy);

// PATCH / PUT /api/admin/pharmacies/:id/reject
router.patch('/pharmacies/:id/reject', rejectPharmacy);
router.put('/pharmacies/:id/reject', rejectPharmacy);

// GET /api/admin/pharmacies/:id/audit
router.get('/pharmacies/:id/audit', getAudit);

module.exports = router;
