const mongoose = require('mongoose')

const studentsSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    parentsphone: {
        type: String,
        required: true
    },
    photo: {
        type: String,
        required: false,
        default: "/uploads/default.jpg"
    },
    documentid: {
        type: String,
        required: false,
        default: "/uploads/default.jpg"
    },
    uid: {
        type: String,
        required: true
    },
    regisDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    role: {
        type: String,
        required: true,
        default: "Student"
    },
    seatAssigned: [
        {
            seatNumber: String,
            slot: String, // This should be a string rather than a nested object
            validityDate: String,
        }
    ],
    accountStatus: {
        type: Boolean,
        required: true,
        default: true
    },
    resetPasswordToken: {
        type: String,
        required: false // This field is not always required, only when resetting password
    },
    resetPasswordExpires: {
        type: Date,
        required: false // This field is not always required, only when resetting password
    },
})

module.exports = mongoose.model('Students', studentsSchema)