const Audit = require('../models/audit'); // Ensure this path matches your file structure
const students = require('../models/students');
const diff = require('deep-diff').diff;

async function auditLog(req, res, next) {
    //console.log('Model set for route:', req.model);
    if (!req.model) {
        console.error('AuditLog middleware called without req.model defined.');
        return next(new Error('Model not defined for auditing.'));
    }
//console.log(req.model, 'Model')
    let originalData = null;
    if (req.method !== 'POST') {
        originalData = await req.model.findById(req.params.id).lean(); // Use .lean() for performance
    }
//console.log(originalData) 
    res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            let newData = null;
            if (req.method === 'POST') {
                newData = res.locals.newData; // Use the newly created data from res.locals
                //console.log('New Post data:', newData);
                const user = await students.findById(req.students.id).lean();
                let affactedDoc = 'Unknown Document';

                if (newData) {
                    affactedDoc = newData.name || newData.clientTxnId || 'Unknown Document';
                }

                const auditEntry = new Audit({
                    collectionName: req.model.collection.collectionName,
                    operationType: req.method,
                    changes: [newData], // Store the entire new data for POST
                    operatedBy: user ? user.name : 'Unknown User', // Assuming req.students.id is available
                    operationDate: new Date(),
                    affactedDoc: affactedDoc
                });

                await auditEntry.save();
                //console.log('Audit Log:', affactedDoc);
            } else if (req.method !== 'DELETE') {
                newData = await req.model.findById(req.params.id).lean();
                //console.log('New data:', newData);
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
                    affactedDoc: originalData ? (originalData.name || originalData.clientTxnId) : (newData ? (newData.name || newData.clientTxnId) : 'Unknown Document')
                });
                await auditEntry.save();
            } 
        }
    });

    next();
}

module.exports = auditLog;