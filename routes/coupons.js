const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const DiscountCoupon = require('../models/discountCoupon');
const { body, validationResult } = require('express-validator');


// Route 1: POST route to create a new discount coupon
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
        if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({ error: "Unauthorized access" });
          }
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
            createdBy: req.students.id
        })
        await newCoupon.save();

        res.status(201).json(newCoupon);

    } catch (error) {
        res.status(500).json({message: 'Error creating coupon: ' + error.message})
    }

});

// Route 2: fetch all coupons

router.get('/fetchcoupons', fetchuser, async(req, res) => {
    try {
        if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({ error: "Unauthorized access" });
          }

        const coupons = await DiscountCoupon.find();
        res.json(coupons)
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal server error!");
    }

})

// Route 3: Toggle status isActive
router.patch('/toggleStatus/:id', fetchuser, async(req, res) => {
    const {id} = req.params;
    const { couponStatus } = req.body
    try {
        if(!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({error: "Unauthorized access"})
        }
        const coupon = await DiscountCoupon.findById(id);

        if(!coupon) {
            return res.status(404).json({ error: "Coupon not found" })
        }

        coupon.isActive = couponStatus;
        await coupon.save();
        res.json({ success: true, message: "Coupon status updated", updatedCoupon: coupon })
        
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal server error!");
    }
})

// Route: 4 Deleting one
router.delete('/delete/:id', fetchuser, async (req, res) => {
    let success=false;
    try {
        if (req.students.role !== "Superadmin") {
            return res.status(403).send({ error: "Unauthorized access" });
          }
          coupon = await DiscountCoupon.findById(req.params.id)
          if(coupon == null) {
            success=false
            return res.status(404).json({message: 'Could not find coupon'})
          }
        await coupon.deleteOne()
        success = true
        res.json({success, message: "Coupon deleted!!"})
    

    } catch (error) {
        success=false
        res.status(500).json({success, message: error.message})
    }
})

module.exports = router