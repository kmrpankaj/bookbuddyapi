const Audit = require('../models/audit'); // Ensure this path matches your file structure
const students = require('../models/students');
const diff = require('deep-diff').diff;

async function auditLog(req, res, next) {
    //console.log('Model set for route:', req.model);
    if (!req.model) {
        console.error('AuditLog middleware called without req.model defined.');
        return next(new Error('Model not defined for auditing.'));
    }

    let originalData = null;
    if (req.method !== 'POST') {
        originalData = await req.model.findById(req.params.id).lean(); // Use .lean() for performance
    }
//console.log(originalData) 
    res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            let newData = null;
            if (req.method !== 'DELETE') {
                newData = await req.model.findById(req.params.id).lean();
            }

            const differences = diff(originalData, newData);
            if (differences) {
                const user = await students.findById(req.students.id).lean();
                const auditEntry = new Audit({
                    collectionName: req.model.collection.collectionName,
                    operationType: req.method,
                    changes: differences, // Store only the differences
                    operatedBy: user ? user.name : 'Unknown User', // Assuming req.students.id is available
                    operationDate: new Date(),
                    affactedDoc: originalData.seatNumber
                });
                await auditEntry.save();
            }
        }
    });

    next();
}

module.exports = auditLog;