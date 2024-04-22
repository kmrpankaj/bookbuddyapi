const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Bookings = require('../models/bookings');

// Route 1: Get all the booking using: GET /bookings/getbookings. Requires login
router.get('/getbooking', async (req, res)=> {
    try {
    const booking = await Bookings.find();
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
    const booking = new Bookings({
        slot, seatId, endDate, studentId: req.students.id
    })
    const savedBooking = await booking.save();
    res.json(savedBooking)
} catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
}
})

// Router 3: Webhook: Transaction status
router.post('/api/webhook', async (req, res) => {
    console.log('Received webhook with body:', req.body);  // This should now correctly log URL-encoded data.

    try {
        // Assuming data is directly in req.body and not nested under 'data'
        const {
            amount,
            client_txn_id,
            p_info,
            customer_name,
            customer_email,
            customer_mobile,
            upi_txn_id,
            status,
            remark,
            udf1,
            udf2,
            udf3,
            redirect_url,
            txnAt,
            createdAt,
        } = req.body;

        if (!amount || !client_txn_id) {
            console.error('Webhook error: Missing required fields');
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const transactionData = {
            amount: parseFloat(amount),  // Convert amount to a float
            clientTxnId: client_txn_id,
            pInfo: p_info,
            customerName: customer_name,
            customerEmail: customer_email,
            customerMobile: customer_mobile,
            redirectUrl: redirect_url,
            paymentStatus: status === "success" ? 'success' : 'failed',
            upiTxnId: upi_txn_id,
            statusRemark: remark,
            udf1,
            udf2,
            udf3,
            txnAt: new Date(txnAt),
            createdAt: new Date(createdAt),
        };

        // Find an existing transaction by clientTxnId or create a new one
        const transaction = await Bookings.findOneAndUpdate(
            { clientTxnId: client_txn_id }, // search filter
            { $set: transactionData }, // update
            { new: true, upsert: true } // options: return new doc if one is upserted
        );
        res.status(200).json({ message: 'Transaction recorded successfully', transaction });
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Router 4: Endpoint to get the transaction status by client transaction ID
router.get('/api/transaction/:clientTxnId', async (req, res) => {
    try {
        const clientTxnId = req.params.clientTxnId;
        const transaction = await Bookings.findOne({ clientTxnId: clientTxnId });

        if (transaction) {
            res.json(transaction);
        } else {
            res.status(404).json({ message: "Transaction not found" });
        }
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Router: 5 // POST endpoint to create an order and save the API response
router.post('/create/order', async (req, res) => {
    const apiUrl = 'https://api.ekqr.in/api/create_order';
    const orderData = {
        key: process.env.UPIGATEWAY_KEY,
        client_txn_id: req.body.client_txn_id,
        amount: req.body.amount,
        p_info: req.body.p_info,
        customer_name: req.body.customer_name,
        customer_email: req.body.customer_email,
        customer_mobile: req.body.customer_mobile,
        redirect_url: req.body.redirect_url,
        udf1: req.body.udf1,
        udf2: req.body.udf2,
        udf3: req.body.udf3
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const responseData = await response.json(); // Parse JSON response

        if (response.ok && responseData.status) {
            const newOrder = new Bookings({
                orderId: responseData.data.order_id,
                clientTxnId: req.body.client_txn_id,
                amount: req.body.amount,
                pInfo: req.body.p_info,
                customerName: req.body.customer_name,
                customerEmail: req.body.customer_email,
                customerMobile: req.body.customer_mobile,
                redirectUrl: req.body.redirect_url,
                udf1: req.body.udf1,
                udf2: req.body.udf2,
                udf3: req.body.udf3,
                orderStatus: responseData.status,
                msg: responseData.msg,
                paymentUrl: responseData.data.payment_url,
                upiIdHash: responseData.data.upi_id_hash
            });

            await newOrder.save();
            res.status(200).json(newOrder);
        } else {
            res.status(400).json({ message: 'Failed to create order', details: responseData });
        }
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});


module.exports = router