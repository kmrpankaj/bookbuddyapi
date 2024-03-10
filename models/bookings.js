const mongoose = require('mongoose')

const bookingsSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'students'
    },
    seatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'seats'
    },
    slot: {
        type: String,
        required: true
    },
    bookingDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    endDate: {
        type: String,
        required: true,
    },
    transactionNum: {
        type: String,
        required: true,
    },
    lockerNum: {
        type: String,
        required: true,
    } 
    // discount needs to be added
})

module.exports = mongoose.model('bookings', bookingsSchema)