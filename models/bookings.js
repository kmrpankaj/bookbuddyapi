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
    // New fields for order creation data
    key: String, // Unique key for the transaction
    clientTxnId: String, // Client Transaction ID
    amount: Number, // Transaction amount, converted to Number for calculations
    pInfo: String, // Product info
    customerName: String,
    customerEmail: String,
    customerMobile: String,
    redirectUrl: String, // URL to redirect to after transaction completion
    // User-defined fields
    udf1: String,
    udf2: String,
    udf3: String,
    paymentUrl: String, // URL to make the payment, received from the API
    upiIdHash: String, // UPI ID hash, for validation
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending'
    },
    upiTxnId: String, // UPI Transaction ID, received from the API
    statusRemark: String, // Remark on the transaction status, received from the API
    txnAt: Date, // Transaction Date
    merchantName: String, // Merchant's Name
    merchantUpiId: String, // Merchant's UPI ID

}, {timestamps: true}); // Ensured proper naming for automatic timestamp configuration

module.exports = mongoose.model('bookings', bookingsSchema);
