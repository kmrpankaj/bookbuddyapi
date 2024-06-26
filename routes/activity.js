const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const Audit = require('../models/audit');



// Route 1: Get all the Activity Log using: GET /activity/getlog. Requires login
router.get('/getlog', fetchuser, async(req, res) => {
    //console.log("User role:", req.students.role);
    try {
        //console.log("User role:", req.students.role);
        // if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
        //     return res.status(403).send({ error: "Unauthorized access" });
        //   }
        const activity = await Audit.find();
        res.json(activity)
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
})


//==================================================================
//#################### Deleting a Log #######################
//==================================================================

// Route: 4 Deleting one
router.delete('/delete/:id', fetchuser, async (req, res) => {
    let success=false;
    try {
        if (req.students.role !== "Superadmin") {
            return res.status(403).send({ error: "Unauthorized access" });
          }
          activitylog = await Audit.findById(req.params.id)
          if(activitylog == null) {
            success=false
            return res.status(404).json({message: 'Could not find coupon'})
          }
        await activitylog.deleteOne()
        success = true
        res.json({success, message: "Log deleted!!"})
    

    } catch (error) {
        success=false
        res.status(500).json({success, message: error.message})
    }
})

module.exports = router