const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
    collectionName: {
        type: String,
        required: true
    },
    operationType: {
        type: String,
        required: true,
        enum: ['CREATE', 'PATCH', 'DELETE', 'POST']
    },
    previousData: mongoose.Schema.Types.Mixed,
    newData: mongoose.Schema.Types.Mixed,
    changes: {
        type: [mongoose.Schema.Types.Mixed], // Array of any type, suitable for storing diff results
        required: false  // Only present when there are differences
    },
    operatedBy: {
        type: String, // Store the name of the user directly
        required: true
    },
    affactedDoc: {
        type: String, // Store the name of the user directly
        required: true
    },
    operationDate: {
        type: Date,
        default: Date.now
    }
});

const Audit = mongoose.model('Audit', auditSchema);
module.exports = Audit;