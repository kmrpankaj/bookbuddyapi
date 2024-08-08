const express = require('express');
const { Resend } = require('resend');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Bookings = require('../models/bookings');
const { Seat } = require('../models/seats');
const Students = require('../models/students')
const puppeteer = require('puppeteer');
const PdfDocument = require('@ironsoftware/ironpdf').PdfDocument;
const resend = new Resend('re_KUJpjvYH_9M4jU7u1N25CKkAG4H8qRzmK');
const auditLog = require('../middleware/auditlog')
const host = process.env.BACKEND_URL

//==============================================================================
// Route 1: Get all the booking using: GET /bookings/getbookings. Requires login
router.get('/getbooking', async (req, res) => {
    try {
        const booking = await Bookings.find();
        res.json(booking)
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
})

router.get('/api/bookings', fetchuser, async (req, res) => {
    try {
        if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({ error: "Unauthorized access" });
        }
        const bookings = await Bookings.find();
        res.status(200).json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


//==========================================================================================
// Route 2: Book a slot: GET /bookings/bookaseat. Requires login
router.post('/bookaseat', fetchuser, [
    body('slot', 'Enter a valid slot').isLength({ min: 3 }),
    body('seatId', 'Enter a valid seat Id'),
    body('endDate', 'Enter a valid end date')

], async (req, res) => {
    try {
        const { slot, seatId, endDate } = req.body;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
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


//============================================================================
// Router 3: Webhook: Transaction status response after payment is done
router.post('/api/webhook', async (req, res) => {
    //console.log('Received webhook with body:', req.body);  // Log the incoming webhook data

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
            paymentStatus: status,
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
        // Call the function to send the POST request
        const receiptSent = await sendReceiptViaPost(booking.clientTxnId);

        if (!receiptSent) {
            console.error('Failed to send email receipt');
            // Handle receipt sending failure (optional: retry or log for investigation)
        }

        res.status(200).json({ success: true, message: "Seats and student data updated successfully" });
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

//===========================================================================================
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


//=========================================================================================
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
        udf3,
        upi_intent
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
            validityInfo,
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
            paymentStatus: 'pending', // Initially set to pending
            upi_intent: responseData.data.upi_intent
        });

        await newOrder.save();
        res.status(200).json({ success: true, message: 'Order created and saved successfully', order: newOrder });

    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});
// ======================================================
// Router: 6: Endpoint to create order offline
router.post('/create/direct-order', fetchuser, auditLog, async (req, res) => {
    req.model = Bookings;
    const {
        bookedBy,
        seatDetails, // Directly use seatDetails from the request body
        bookingDate,
        clientTxnId,
        createdAt,
        amount,
        discountCoupon,
        discountValue,
        totalPrice,
        paymentMode,
        orderStatus,
        statusRemark,
        pCash,
        pOnline,
        pInfo,
        validityInfo,
        locker,
        securityDeposit,
        customerName,
        customerEmail,
        customerMobile,
        udf1,
        udf2,
        udf3,
        paymentStatus,
        updatedAt,

    } = req.body;
    //console.log(req.body, 'Reqbody')
    try {
        // Create the order in the database
        const newOrder = new Bookings({
            bookedBy,
            seatDetails,
            bookingDate: bookingDate,
            clientTxnId: clientTxnId,
            createdAt,
            amount,
            discountCoupon,
            discountValue,
            totalPrice,
            paymentMode,
            orderStatus,
            statusRemark,
            pCash,
            pOnline,
            pInfo,
            validityInfo,
            locker,
            securityDeposit,
            customerName,
            customerEmail,
            customerMobile,
            udf1,
            udf2,
            udf3,
            orderStatus: true, // Set initial order status
            paymentStatus,
            updatedAt,
        });

        await newOrder.save();
        res.locals.newData = newOrder.toObject(); // Store the newly created data in res.locals

        res.status(200).json({ success: true, message: 'Order created and saved successfully', order: newOrder, });
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});




// =======================================================
// Router: 7: Endpoint for direct webhook
router.post('/api/direct-webhook', async (req, res) => {
    try {
        const { clientTxnId } = req.body;

        if (!clientTxnId) {
            return res.status(400).json({ message: 'Missing required field: clientTxnId' });
        }

        // Find the corresponding booking using the transaction ID
        const booking = await Bookings.findOne({ clientTxnId });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
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

        // Optionally, we can call a function to send a receipt or other notifications
        // const receiptSent = await sendReceiptViaPost(booking.clientTxnId);

        // if (!receiptSent) {
        //   console.error('Failed to send email receipt');
        // }

        res.status(200).json({ message: 'Seats and student data updated successfully' });
    } catch (error) {
        console.error('Error handling direct webhook:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});


// =======================================================
// Router: 9: Endpoint to delete a booking
router.delete('/api/delete/booking/:id', fetchuser, auditLog, async (req, res) => {
    req.model = Bookings;
    try {
        const bookingId = req.params.id;
        await Bookings.findByIdAndDelete(bookingId);
        res.status(200).json({ message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// =======================================================
// Router: 10: Endpoint to generate a unique transaction ID
router.patch('/api/edit/bookings/:id', fetchuser, auditLog, async (req, res) => {
    req.model = Bookings;
    try {
        const { id } = req.params;
        const updatedBooking = req.body;
        const booking = await Bookings.findByIdAndUpdate(id, updatedBooking, { new: true });
        res.status(200).json(booking);
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// =======================================================
// Router: 11: Endpoint Function to handle clearing dues
const handleClearDues = async (req, res) => {
    try {
      const { id } = req.params;
      const booking = await Bookings.findById(id);
  
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }
  
      const udf2Value = parseFloat(booking.udf2) || 0;
      const udf1Value = parseFloat(booking.udf1) || 0;
  
      // Update udf1 by adding udf2 value to it
      booking.udf1 = (udf1Value + udf2Value).toString();
  
      // Set udf2 to '0' and pending to paid
      booking.udf2 = '0';
      booking. paymentStatus = 'paid'
  
      // Use the values from the frontend request to update pCash and pOnline
    if (req.body.pCashValue !== undefined) {
      booking.pCash = (booking.pCash || 0) + parseFloat(req.body.pCashValue);
    }

    if (req.body.pOnlineValue !== undefined) {
      booking.pOnline = (booking.pOnline || 0) + parseFloat(req.body.pOnlineValue);
    }

      await booking.save();
  
      res.status(200).json({ message: 'Dues cleared and booking updated', booking });
    } catch (error) {
      console.error('Error handling clear dues:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
  
  // Usage in your route
  router.patch('/api/clear-dues/:id', fetchuser, auditLog, handleClearDues);


// Fetch a single booking by ID
router.get('/api/singlebookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Bookings.findById(id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        res.status(200).json(booking);
    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// =======================================================
// Router: 11: Endpoint to generate a unique transaction ID
// 
router.get('/generate-txn-id', async (req, res) => {
    let unique = false;
    let txnId;
    while (!unique) {
        txnId = Math.floor(10000 + Math.random() * 90000); // Generates a 05-digit number
        // Check if this ID already exists in the database
        const exists = await Bookings.findOne({ clientTxnId: txnId });
        if (!exists) {
            unique = true; // If the ID does not exist, it's unique
        }
    }
    res.json({ clientTxnId: txnId });
});


// Router: 10 Route to generate PDF for a specific booking
router.get('/generate-receipt/:clientTxnId', async (req, res) => {
    try {
        const clientTxnId = req.params.clientTxnId;
        const booking = await Bookings.findOne({ clientTxnId: clientTxnId }).exec();

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        // Function to convert slot to timings
        const convertSlotToTimings = (slot) => {
            const slotMap = {
                morning: "06 am to 10 am",
                afternoon: "10 am to 02 pm",
                evening: "02 pm to 06 pm",
                night: "06 pm to 10 pm",
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
                        <span><span class='text-muted'>Valid through: </span>${(seat.seatValidTill) ? formatDate(seat.seatValidTill) : "Next term"}</span>
                    </div>
                </td>
                <td width="20%">
                    <div class="text-right">
                        <span class="font-weight-bold">₹400</span>
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
                            <h3 class="text-center">Payment Reciept</h3>
                            <span class="font-weight-bold d-block mt-4"><span class="text-muted">Name: </span>${booking.customerName}</span><span class="d-block"><span class="text-muted">Email: </span>${booking.customerEmail}</span><span><span class="text-muted">Mobile: </span>${booking.customerMobile}</span>
                            <div
                            class="payment border-top mt-3 mb-3 border-bottom table-responsive">
                                <table class="table table-borderless" style="width: 100%;">
                                    <tbody>
                                        <tr>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Receipt Date</span><span>${formatDate(booking.bookingDate)}</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Receipt No</span><span>${booking.clientTxnId}</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">Payment</span><span>Online</span></div>
                                            </td>
                                            <td>
                                                <div class="py-2"><span class="d-block text-muted">${(!booking.upiTxnId) ? 'Status' : "Transaction ID"}</span><span class="${(!booking.upiTxnId) ? "text-danger" : ""}">${(!booking.upiTxnId) ? booking.paymentStatus : booking.upiTxnId}</span></div>
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
                                                <div class="text-right"><span class="${(booking.paymentStatus === "success") ? "text-success" : "text-danger"} font-weight-bold">${booking.paymentStatus}</span></div>
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


// Route to send a booking receipt as email
router.post('/send-receipt/:clientTxnId', async (req, res) => {
    try {
        const clientTxnId = req.params.clientTxnId;
        const booking = await Bookings.findOne({ clientTxnId: clientTxnId }).exec();

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        // Function to convert slot to timings
        const convertSlotToTimings = (slot) => {
            const slotMap = {
                morning: "06 am to 10 am",
                afternoon: "10 am to 02 pm",
                evening: "02 pm to 06 pm",
                night: "06 pm to 10 pm",
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

    <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;color:rgb(51, 51, 51);background-color:rgb(250, 250, 250);border-radius:3px;margin-bottom:1px">
                      <tbody style="width:100%">
                        <tr style="width:100%">
                          <td data-id="__react-email-column">
                            <p style="font-size:14px;line-height:24px;margin:16px 0;padding-left:15px">Table Number: ${seat.seatNumber || "New Booking"} <br />Slot: ${convertSlotToTimings(seat.slot)} <br />Valid through: ${(seat.seatValidTill) ? formatDate(seat.seatValidTill) : "Next term"}</p>
                          </td>
                          <td data-id="__react-email-column" style="float:right">
                            <p style="font-size:14px;line-height:24px;margin:16px 0;padding-right:15px">₹400</p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
`).join('');

        // Conditional HTML for partial payment
        const partialPaymentHtml = booking.udf1 && booking.udf1 !== '0' ? `
                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                    <tbody style="width:100%">
                        <tr style="width:100%">
                            <td data-id="__react-email-column">
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Partial Payment:</p>
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.udf1 ? 'Yes' : 'No'}</p>
                            </td>
                            <td data-id="__react-email-column">
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Amount Paid:</p>
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.udf1}</p>
                            </td>
                            <td data-id="__react-email-column" style="float:right">
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Due:</p>
                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.udf2}</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                ` : '';

        // Locker
        const lockerHtml = booking.locker && booking.locker === true ? 
        `
            <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;color:rgb(51, 51, 51);background-color:rgb(250, 250, 250);border-radius:3px;margin-bottom:1px">
                <tbody style="width:100%">
                <tr style="width:100%">
                    <td data-id="__react-email-column">
                    <p style="font-size:14px;line-height:24px;margin:16px 0;padding-left:15px">Locker: (Valid for one month)</p>
                    </td>
                    <td data-id="__react-email-column" style="float:right">
                    <p style="font-size:14px;line-height:24px;margin:16px 0;padding-right:15px">₹100</p>
                    </td>
                </tr>
                </tbody>
            </table>
        
        `: '';

        // security deposit
        const securityDepositHtml = booking.securityDeposit && booking.securityDeposit === true ? 
        `
            <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;color:rgb(51, 51, 51);background-color:rgb(250, 250, 250);border-radius:3px;margin-bottom:1px">
                <tbody style="width:100%">
                <tr style="width:100%">
                    <td data-id="__react-email-column">
                    <p style="font-size:14px;line-height:24px;margin:16px 0;padding-left:15px">Locker Security: (Refundable)</p>
                    </td>
                    <td data-id="__react-email-column" style="float:right">
                    <p style="font-size:14px;line-height:24px;margin:16px 0;padding-right:15px">₹100</p>
                    </td>
                </tr>
                </tbody>
            </table>
        
        `: '';

        // Assuming you have a function to generate HTML receipt
        const html = `
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd" >
        <html dir="ltr" lang="en">

            <head>
                <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
            </head>
            <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">Your payment receipt for the payment made on Bookbuddy Library members page.<div> </div>
            </div>

            <body style="background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,&quot;Helvetica Neue&quot;,Ubuntu,sans-serif">
                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:50.5em;background-color:#ffffff;margin:0 auto;padding:20px 0 48px;margin-bottom:64px">
                    <tbody>
                        <tr style="width:100%">
                            <td>
                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="padding:0 48px">
                                    <tbody>
                                        <tr>
                                            <td>
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column"><img alt="Stripe" height="" src="https://bookbuddy.co.in/wp-content/uploads/2023/02/Background.png" style="display:block;outline:none;border:none;text-decoration:none" width="170" /></td>
                                                            <td data-id="__react-email-column">
                                                                <h1 style="color:#333;font-family:-apple-system, BlinkMacSystemFont, &#x27;Segoe UI&#x27;, &#x27;Roboto&#x27;, &#x27;Oxygen&#x27;, &#x27;Ubuntu&#x27;, &#x27;Cantarell&#x27;, &#x27;Fira Sans&#x27;, &#x27;Droid Sans&#x27;, &#x27;Helvetica Neue&#x27;, sans-serif;font-size:24px;font-weight:bold;margin:10px 0;padding:0">BookBuddy</h1>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">Library &amp; Co - Study Zone</p>
                                                                <p style="font-size:12px;line-height:16px;margin:16px 0;margin-bottom:0;color:#8898aa">info@bookbuddy.co.in</p>
                                                                <p style="font-size:12px;line-height:16px;margin:16px 0;margin-top:0;color:#8898aa">www.bookbuddy.co.in</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <h1 style="text-align:center;color:#333;font-family:-apple-system, BlinkMacSystemFont, &#x27;Segoe UI&#x27;, &#x27;Roboto&#x27;, &#x27;Oxygen&#x27;, &#x27;Ubuntu&#x27;, &#x27;Cantarell&#x27;, &#x27;Fira Sans&#x27;, &#x27;Droid Sans&#x27;, &#x27;Helvetica Neue&#x27;, sans-serif;font-size:20px;font-weight:bold;margin:10px 0;padding:0">Payment Receipt</h1>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Name:</p>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.customerName}</p>
                                                            </td>
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Email:</p>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.customerEmail}</p>
                                                            </td>
                                                            <td colSpan="2" data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Mobile:</p>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.customerMobile}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Receipt Number:</p>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${booking.clientTxnId}</p>
                                                            </td>
                                                            <td data-id="__react-email-column">
                                                                    <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">Txn Date:</p>
                                                                    <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${formatDate(booking.bookingDate)}</p>
                                                            </td>
                                                            <td data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f;text-align:left">${(!booking.upiTxnId) ? 'Status' : 'Transaction Id:'}</p>
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-top:0;color:#525f7f;text-align:left">${(!booking.upiTxnId) ? booking.paymentStatus : booking.upiTxnId}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                ${seatRows}
                                                ${lockerHtml}
                                                ${securityDepositHtml}
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f">Subtotal</p>
                                                            </td>
                                                            <td data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f">₹${booking.totalPrice}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f">Discount</p>
                                                            </td>
                                                            <td data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f">${booking.discountValue !== '0' ? '-₹' + booking.discountValue : '₹0'}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:17px;line-height:17px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f;font-weight:700">Total</p>
                                                            </td>
                                                            <td data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:17px;line-height:17px;margin:16px 0;margin-bottom:7px;margin-top:7px;color:#525f7f;font-weight:700">₹${booking.amount}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                
                                                ${partialPaymentHtml}

                                                <table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody style="width:100%">
                                                        <tr style="width:100%">
                                                            <td data-id="__react-email-column">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f">Mode</p>
                                                                <p style="font-size:14px;line-height:14px;margin:16px 0;margin-top:0;color:#525f7f">${booking.paymentMode === 'Mixed' ? 'Online/Cash' : booking.paymentMode}</p>
                                                            </td>
                                                            <td data-id="__react-email-column" style="float:right">
                                                                <p style="font-size:16px;line-height:16px;margin:16px 0;margin-bottom:10px;color:#525f7f">Status</p>
                                                                <p style="font-size:14px;line-height:14px;margin:16px 0;margin-top:0;color:#525f7f">${booking.paymentStatus}</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                <p style="font-size:12px;line-height:16px;margin:16px 0;color:#8898aa;margin-bottom:3px;margin-top:3px;text-align:center">Note: This is a computer generated receipt and doesn&#x27;t require any sign.</p>
                                                <p style="font-size:12px;line-height:16px;margin:16px 0;color:#8898aa;margin-bottom:3px;margin-top:3px;text-align:center">Address: 2nd &amp; 3rd Floor, Skyline Tower, Adarsh Nagar, Samastipur</p>
                                                <hr style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#e6ebf1;margin:20px 0" />
                                                <p style="font-size:12px;line-height:16px;margin:16px 0;color:#8898aa;margin-bottom:3px;margin-top:3px;text-align:center">Terms &amp; Conditions apply*</p>
                                                <p style="font-size:12px;line-height:16px;margin:16px 0;color:#8898aa;margin-bottom:3px;margin-top:3px;text-align:center">All rights reserved.</p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </body>

        </html>
    `;

        const { data, error } = await resend.emails.send({
            from: '"BookBuddy" <info@bookbuddy.co.in>',
            to: booking.customerEmail,
            subject: 'Your recent payment receipt!',
            html: html,
        });

        if (error) {
            return res.status(400).json({ error });
        }

        res.status(200).json({ message: 'Email receipt sent successfully', data });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while sending the email receipt');
    }
});

// function to get send the receipt to email using send-receipt
async function sendReceiptViaPost(clientTxnId) {
    try {
        const url = `${host}/bookings/send-receipt/${clientTxnId}`;
        const options = {
            method: 'POST',
        };
        // console.log(`URL being called: ${url}`); 
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`Failed to send email receipt (status: ${response.status})`);
        }

        //console.log('Email receipt sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending email receipt:', error);
        return false;
    }
}


// Route 7: Search students
router.get('/search-students', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ message: "Query parameter is required" });
        }

        const searchCriteria = {
            $or: [
                { uid: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        };

        const students = await Students.find(searchCriteria).limit(10);
        res.json(students);
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
});


module.exports = router




