const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const DiscountCoupon = require('../models/discountCoupon');
const { body, validationResult } = require('express-validator');


// POST route to create a new discount coupon
router.post('/create', fetchuser,
[
    body('code', 'Coupon code is required').notEmpty(),
    body('discountType', 'Discount type must be either "amount" or "percentage"').isIn(['amount', 'percentage']),
    body('discountValue', 'Discount value is required and must be a number').isNumeric()
],
async (req, res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({error: errors.array()});
    }

    try {
        const { code, description, discountType, discountValue, expirationDate, usageLimit, isActive } = req.body;

        // create new coupon document
        const newCoupon = new DiscountCoupon({
            code,
            description,
            discountType,
            discountValue,
            expirationDate,
            usageLimit,
            isActive,
            createdBy: req.students._id
        })
        await newCoupon.save();

        res.status(201).json(newCoupon);

    } catch (error) {
        res.status(500).json({message: 'Error creating coupon: ' + error.message})
    }

});

module.exports = router