const Audit = require('../models/audit'); // Assuming you have an Audit model

async function auditLog(req, res, next) {
    const originalData = await req.model.findById(req.params.id);
    
    res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { // Successful request
            const newData = await req.model.findById(req.params.id);
            const auditEntry = new Audit({
                collectionName: req.model.collection.collectionName,
                operationType: req.method,
                previousData: originalData,
                newData: newData,
                operatedBy: req.user._id, // Make sure the user information is available in request
                operationDate: new Date()
            });
            await auditEntry.save();
        }
    });
    
    next();
}