const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Bookings = require('../models/bookings');
const { Seat } = require('../models/seats');
const Students = require('../models/students')
const puppeteer = require('puppeteer');


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
        slot, seatId, endDate, bookedBy: req.students.uid
    })
    const savedBooking = await booking.save();
    res.json(savedBooking)
} catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
}
})

// Router 3: Webhook: Transaction status response after payment is done
router.post('/api/webhook', async (req, res) => {
    console.log('Received webhook with body:', req.body);  // Log the incoming webhook data

    try {
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
            ip,
            txnAt,
            createdAt,
        } = req.body;

        if (!amount || !client_txn_id) {
            console.error('Webhook error: Missing required fields');
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const transactionData = {
            amount: parseFloat(amount),
            clientTxnId: client_txn_id,
            pInfo: p_info,
            customerName: customer_name,
            customerEmail: customer_email,
            customerMobile: customer_mobile,
            redirectUrl: redirect_url,
            paymentStatus: status === "success" ? 'success' : 'failed',
            upiTxnId: upi_txn_id,
            statusRemark: remark,
            ipAddress: ip,
            udf1,
            udf2,
            udf3,
            txnAt: new Date(txnAt),
            createdAt: new Date(createdAt),
        };

        // Update the booking transaction record
        const transaction = await Bookings.findOneAndUpdate(
            { clientTxnId: client_txn_id },
            { $set: transactionData },
            { new: true, upsert: true }
        );

        if (status !== "success") {
            return res.status(400).json({ success: false, message: 'Payment failed or pending' });
        }

        // Find the corresponding booking using the transaction ID
        const booking = await Bookings.findOne({ clientTxnId: client_txn_id });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Process updates only for renewal types or if the seat number is already assigned
        const updates = booking.seatDetails
            .filter(seat => seat.type === 'renewal' || seat.seatNumber)
            .map(seat => {
                const slotPath = `seatStatus.${seat.slot}`; // Dynamic path to the slot
                const seatUpdate = Seat.updateOne(
                    { seatNumber: seat.seatNumber },
                    { $set: { [`${slotPath}.seatValidTill`]: seat.seatValidTill, [`${slotPath}.bookedBy`]: booking.bookedBy } }
                );

                const studentUpdate = Students.updateOne(
                    { uid: booking.bookedBy, "seatAssigned.seatNumber": seat.seatNumber, "seatAssigned.slot": seat.slot },
                    { $set: { "seatAssigned.$.validityDate": new Date(seat.seatValidTill).toISOString().split('T')[0] } }
                );

                return Promise.all([seatUpdate, studentUpdate]);
            });

        await Promise.all(updates);

        res.status(200).json({ success: true, message: "Seats and student data updated successfully" });
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

    const {
        bookedBy,
        seatsToRenew = [],
        newSlots = [],
        client_txn_id,
        amount,
        discountCoupon,
        discountValue,
        totalPrice,
        p_info,
        customer_name,
        customer_email,
        customer_mobile,
        redirect_url,
        udf1,
        udf2,
        udf3
    } = req.body;

    const apiUrl = 'https://api.ekqr.in/api/create_order';
    const orderData = {
        key: process.env.UPIGATEWAY_KEY,
        client_txn_id,
        amount,
        p_info,
        customer_name,
        customer_email,
        customer_mobile,
        redirect_url,
        udf1,
        udf2,
        udf3
    };


    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const responseData = await response.json(); // Parse JSON response

        if (!response.ok || !responseData.status) {
            throw new Error('Failed to create order with payment gateway: ' + responseData.message);
        }

        // Process seat details combining renewals and new slots
        const seatDetails = seatsToRenew.map(seat => ({
            seatNumber: seat.seatNumber,
            slot: seat.slot,
            seatValidTill: new Date(seat.validityDate),
            type: 'renewal'
        }));

        newSlots.forEach(slot => {
            seatDetails.push({
                seatNumber: '', // Seat number to be assigned by admin
                slot: slot,
                type: 'new'
            });
        });

        // Create the order in the database
        const newOrder = new Bookings({
            bookedBy,
            seatDetails,
            bookingDate: new Date(),
            clientTxnId: client_txn_id,
            amount,
            discountCoupon,
            discountValue,
            totalPrice,
            pInfo: p_info,
            customerName: customer_name,
            customerEmail: customer_email,
            customerMobile: customer_mobile,
            redirectUrl: redirect_url,
            udf1,
            udf2,
            udf3,
            orderStatus: responseData.status,
            msg: responseData.msg,
            paymentUrl: responseData.data.payment_url,
            upiIdHash: responseData.data.upi_id_hash,
            paymentStatus: 'pending' // Initially set to pending
        });

            await newOrder.save();
            res.status(200).json({ success: true, message: 'Order created and saved successfully', order: newOrder });
        
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// Router: 6: Endpoint to generate a unique transaction ID
// 
router.get('/generate-txn-id', async (req, res) => {
    let unique = false;
    let txnId;
    while (!unique) {
        txnId = Math.floor(1000000000 + Math.random() * 9000000000); // Generates a 10-digit number
        // Check if this ID already exists in the database
        const exists = await Bookings.findOne({ clientTxnId: txnId });
        if (!exists) {
            unique = true; // If the ID does not exist, it's unique
        }
    }
    res.json({ clientTxnId: txnId });
});


// Router: 6 Route to generate PDF for a specific booking
router.get('/generate-receipt/:clientTxnId', async (req, res) => {
    try {
        const clientTxnId = req.params.clientTxnId;
        const booking = await Bookings.findOne({clientTxnId: clientTxnId}).exec();

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        // Function to convert slot to timings
        const convertSlotToTimings = (slot) => {
            const slotMap = {
                morning: "06 am to 10 am",
                afternoon: "02 pm to 06 pm",
                evening: "06 pm to 10 pm",
                night: "10 pm to 02 am",
            };
            return slotMap[slot] || "Time not available";
        };

        // Function to format dates
        const formatDate = (dateString) => {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const date = new Date(dateString);
            
            const day = date.getDate();
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            
            return `${day} ${month}, ${year}`;
        };

        // Generate rows for each seat
        const seatRows = booking.seatDetails.map(seat => `
            <tr>
                <td width="20%">
                    <svg style="opacity: .2" width="90" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M64 160C64 89.3 121.3 32 192 32H448c70.7 0 128 57.3 128 128v33.6c-36.5 7.4-64 39.7-64 78.4v48H128V272c0-38.7-27.5-71-64-78.4V160zM544 272c0-20.9 13.4-38.7 32-45.3c5-1.8 10.4-2.7 16-2.7c26.5 0 48 21.5 48 48V448c0 17.7-14.3 32-32 32H576c-17.7 0-32-14.3-32-32H96c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V272c0-26.5 21.5-48 48-48c5.6 0 11 1 16 2.7c18.6 6.6 32 24.4 32 45.3v48 32h32H512h32V320 272z"/></svg>
                </td>
                <td width="60%">
                    <span class="font-weight-bold"><span class='text-muted'>Table Number: </span>${seat.seatNumber || "New Booking"}</span>
                    <div class="product-qty">
                        <span class="d-block"><span class='text-muted'>Slot: </span>${convertSlotToTimings(seat.slot)}</span>
                        <span><span class='text-muted'>Valid through: </span>${(seat.seatValidTill)?formatDate(seat.seatValidTill):"Next term"}</span>
                    </div>
                </td>
                <td width="20%">
                    <div class="text-right">
                        <span class="font-weight-bold">₹350</span>
                    </div>
                </td>
            </tr>
        `).join('');

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const content = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Payment Receipt</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet">
                <style>
                    body { font-family: Arial, sans-serif; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; }
                    .logo, .invoice, .footer { padding: 20px; }
                    .logo { background-color: #1a092d; color: white; }
                </style>
            </head>
            <body>
            <div class="container mt-3 mb-3 mb-5 print-container no-responsive">
            <div class="row d-flex justify-content-center" style="width: 1200px; margin: 0px auto;">
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header text-left logo p-2 px-5 pt-3" style="background-color: rgb(26, 9, 45);">
                            <div class="d-inline-block"><img src="https://bookbuddy.co.in/wp-content/uploads/2023/02/Background-300x264.png" width="150"></div>
                            <div class="d-inline-block align-middle">
                                <h1 class=" mx-3">BookBuddy</h1><span class="text-light mx-3 px-1">Library &amp; Co-Study Zone</span></div>
                        </div>
                        <div class="invoice p-5 pt-4">
                            <h3 class="text-center">Payment Reciept</h3><span class="font-weight-bold d-block mt-4"><span class="text-muted">Name: </span>${booking.customerName}</span><span class="d-block"><span class="text-muted">Email: </span>${booking.customerEmail}</span><span><span class="text-muted">Mobile: </span>${booking.customerMobile}</span>
                            <div
                            class="payment border-top mt-3 mb-3 border-bottom table-responsive">
                                <table class="table table-borderless" style="width: 100%;">
                                    <tbody>
                                        <tr>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Receipt Date</span><span>${formatDate(booking.txnAt)}</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Receipt No</span><span>${booking.clientTxnId}</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Payment</span><span>Online</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Transaction ID</span><span class="${(!booking.upiTxnId)?"text-danger":""}">${(!booking.upiTxnId)?booking.paymentStatus:booking.upiTxnId}</span></div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                        </div>
                        <div class="product border-bottom table-responsive">
                            <table class="table table-borderless" style="width: 100%;">
                                <tbody>
                                ${seatRows}
                                </tbody>
                            </table>
                        </div>
                        <div class="row d-flex justify-content-end">
                            <div class="col-md-5">
                                <table class="table table-borderless">
                                    <tbody class="totals">
                                        <tr>
                                            <td>
                                                <div class="text-left"><span class="text-muted">Subtotal</span></div>
                                            </td>
                                            <td>
                                                <div class="text-right"><span>₹${booking.totalPrice}</span></div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="text-left"><span class="text-muted">Discount</span></div>
                                            </td>
                                            <td>
                                                <div class="text-right"><span class="text-success">₹${booking.discountValue}</span></div>
                                            </td>
                                        </tr>
                                        <tr class="border-top border-bottom">
                                            <td>
                                                <div class="text-left"><span class="font-weight-bold">Total</span></div>
                                            </td>
                                            <td>
                                                <div class="text-right"><span class="font-weight-bold">₹${booking.amount}</span></div>
                                            </td>
                                        </tr>

                                        <tr class="border-top">
                                            <td>
                                                <div class="text-left"><span class="font-weight-bold">Status</span></div>
                                            </td>
                                            <td>
                                                <div class="text-right"><span class="${(booking.paymentStatus==="success")?"text-success":"text-danger"} font-weight-bold">${booking.paymentStatus}</span></div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <p>For new seat bookings seat number will be assigned shortly by administrator and informed on email!</p>
                        <p class="font-weight-bold mb-0">Thank You!</p><span class="fw-bold">BookBuddy Library</span><span class="text-muted d-block">2nd &amp; 3rd Floor, Skyline Tower,</span><span class="text-muted d-block">Adarsh Nagar, Samastipur</span><span class="text-muted d-block">Email: info@bookbuddy.co.in</span>
                        <span
                        class="text-muted d-block">Phone: +917042912701</span>
                    </div>
                    <div class="d-flex justify-content-between footer p-3 card-footer"><small class="d-block">Terms &amp; Conditions Applied*</small><small class="text-muted d-block">Enjoy your continued focus time!!</small><small>${formatDate(booking.txnAt)}</small></div>
                </div>
            </div>
        </div>
        </div>
            </body>
            </html>
        `;

        await page.setContent(content);
        const pdf = await page.pdf({ format: 'A4' });

        await browser.close();

        res.contentType('application/pdf');
        res.send(pdf);
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while generating the PDF');
    }
});

module.exports = router