const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authenticateToken');
const { createReservation, confirmReservation, cancelReservation, pickupReservation, listMyReservations } = require('../controllers/reservationsController');

// All reservation routes require auth
router.use(authenticateToken);

// Create a reservation (customer)
router.post('/', createReservation);

// List my reservations (customer)
router.get('/', listMyReservations);

// Confirm (pharmacy owner/admin) and cancel
router.patch('/:id/confirm', confirmReservation);
router.patch('/:id/cancel', cancelReservation);
router.patch('/:id/pickup', pickupReservation);

module.exports = router;
