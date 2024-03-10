const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
    status: {
        type: Boolean,
        default: false,
    },
    bookedBy: {
        type: String,
        ref: 'Students',
    },
    seatValidTill: {
        type: Date,
        required: false
    }
});

const seatsSchema = new mongoose.Schema({
    seatNumber: {
        type: String,
        required: true,
    },
    seatLocation: {
        type: String,
        required: true,
    },
    seatStatus: {
        morning: slotSchema,
        afternoon: slotSchema,
        evening: slotSchema,
        night: slotSchema,
    },
});

const Seat = mongoose.model('seats', seatsSchema);

module.exports = {
    Seat,
    slotSchema,
};