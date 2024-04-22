const mongoose = require('mongoose');

const discountCouponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true, // Ensure uniqueness for each coupon code
    },
    description: String, // Optional: For internal notes or public descriptions
    discountType: {
        type: String,
        required: true,
        enum: ['amount', 'percentage'] // Ensures the discount type is either 'amount' or 'percentage'
    },
    discountValue: {
        type: Number,
        required: true // Value of the discount, interpretation depends on discountType
    },
    expirationDate: {
        type: Date,
        default: () => new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
    },
    usageLimit: {
        type: Number,
        default: null // Null can represent unlimited usage
    },
    createdBy: mongoose.Schema.Types.ObjectId,
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
module.exports = DiscountCoupon;
