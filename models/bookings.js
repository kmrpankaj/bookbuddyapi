const mongoose = require('mongoose');

const seatDetailSchema = new mongoose.Schema({
    seatNumber: String,
    slot: {
        type: String,
        enum: ['morning', 'afternoon', 'evening', 'night'], // Ensures slot is one of these values
    },
    seatValidTill: Date,
});

const bookingsSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'students',
        required: true
    },
    seatDetails: [seatDetailSchema], // Array of seat details
    bookingDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    endDate: Date, // Made type consistent with Date
    transactionNum: {
        type: String,
        required: true,
    },
    // discount can be added here as needed
    discountCoupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DiscountCoupon', // Reference to the DiscountCoupon model
        required: false,
    },
    
}, {timestamps: true}); // Ensured proper naming for automatic timestamp configuration

module.exports = mongoose.model('bookings', bookingsSchema);
