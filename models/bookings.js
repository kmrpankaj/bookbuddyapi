const mongoose = require('mongoose');

const seatDetailSchema = new mongoose.Schema({
    seatNumber: String,
    slot: {
        type: String,
        enum: ['morning', 'afternoon', 'evening', 'night'], // Ensures slot is one of these values
    },
    seatValidTill: Date,
    type: {
        type: String,
        enum: ['new', 'renewal'],
        required: true
    }
});

const bookingsSchema = new mongoose.Schema({
    bookedBy: {
        type: String,
        ref: 'Students',
    },
    seatDetails: [seatDetailSchema], // Array of seat details
    bookingDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    clientTxnId: {
        type: String,
        required: true,
    },
    // discount can be added here as needed
    discountCoupon: {
        type: String,
        ref: 'DiscountCoupon', // Reference to the DiscountCoupon model
        required: false,
    },
    discountValue: { // Value of the discount applied
        type: Number,
        default: 0
    },
    totalPrice: { // Total price after discount
        type: Number,
        required: true
    },
    // New fields for order creation data
    orderStatus: Boolean,
    msg: String,
    orderId: Number,
    paymentUrl: String,
    amount: Number, // Transaction amount, converted to Number for calculations
    pInfo: String, // Product info
    upiIdHash: String, // UPI ID hash, for validation
    customerName: String,
    customerEmail: String,
    customerMobile: String,
    redirectUrl: String, // URL to redirect to after transaction completion
    // User-defined fields
    udf1: String,
    udf2: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending'
    },
    upiTxnId: String, // UPI Transaction ID, received from the API
    statusRemark: String, // Remark on the transaction status, received from the API
    ipAddress: String,
    txnAt: Date, // Transaction Date
    createdAt: Date,
    merchantName: String, // Merchant's Name
    merchantUpiId: String, // Merchant's UPI ID

}, {timestamps: true}); // Ensured proper naming for automatic timestamp configuration

module.exports = mongoose.model('Bookings', bookingsSchema);
