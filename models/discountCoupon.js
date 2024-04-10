const mongoose = require('mongoose');

const discountCouponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true, // Ensure uniqueness for each coupon code
    },
    description: String, // Optional: For internal notes or public descriptions
    amount: Number, // Use either amount
    percentage: Number, // Or percentage, depending on your discount type
    expirationDate: Date, // Optional: If the coupon has an expiration date
    usageLimit: Number, // Optional: Maximum number of times the coupon can be used
    timesUsed: {
        type: Number,
        default: 0, // Keep track of how many times the coupon has been used
    },
    isActive: {
        type: Boolean,
        default: true, // Track whether the coupon is currently active
    },
    // Add any additional fields as necessary
});

const DiscountCoupon = mongoose.model('DiscountCoupon', discountCouponSchema);
