const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const seats = require('../models/bookings')
const { body, validationResult } = require('express-validator');
const bookings = require('../models/bookings');

// Route 1: Get all the booking using: GET /bookings/getbookings. Requires login
router.get('/getbooking', fetchuser, async (req, res)=> {
    try {
    const booking = await bookings.find();
    res.json(booking)
} catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
}
})

// Route 2: Book a slot: GET /bookings/bookaseat. Requires login
router.post('/bookaseat', fetchuser, [
    body('slot', 'Enter a valid slot').isLength({min: 3}),
    body('seatId', 'Enter a valid seat Id'),
    body('endDate', 'Enter a valid end date')

], async (req, res)=> {
    try {
    const {slot, seatId, endDate} = req.body;
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        return res.status(400).json({errors: errors.array()});
    }
    const booking = new bookings({
        slot, seatId, endDate, studentId: req.students.id
    })
    const savedBooking = await booking.save();
    res.json(savedBooking)
} catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
}
})

module.exports = router