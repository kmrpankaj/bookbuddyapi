const express = require('express');
const fetchuser = require('../middleware/fetchuser');
const router = express.Router();
const { Seat } = require('../models/seats');
const { body, validationResult } = require('express-validator');
const Students = require('../models/students')

// Route 1: Get all the seats using: GET /seats/getseats. Requires login
router.get('/fetchallseats', fetchuser, async (req, res)=> {
    try {
        if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({ error: "Unauthorized access" });
          }
    const seat = await Seat.find();
    res.json(seat)
} catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
}
})

// Route 2: Add a new seat using: POST /seats/addseats. Requires login
// router.post('/addaseat', fetchuser, [
//     body('seatNumber', 'Enter a seat number').isLength({min: 3}),
//     body('seatLocation', 'Enter a valid location').isLength({min: 3}),
//     body('seatStatus', 'Enter a boolean value').isBoolean(),
//     body('slot', 'Enter a valid location').isLength({min: 3})
// ], async (req, res)=> {
//     try {
//     const {seatNumber, seatLocation, seatStatus, slot} = req.body;
//     const errors = validationResult(req);
//     if(!errors.isEmpty()) {
//         return res.status(400).json({errors: errors.array()});
//     }
//     if (req.students.role !== "Admin") {
//         return res.status(403).send({ error: "Unauthorized access" });
//       }
//     const seat = new seats({
//         seatNumber, seatLocation, seatStatus, slot, students: req.students.id
//     })
//     const savedSeat = await seat.save();
//     res.json(savedSeat)
// } catch (error) {
//         console.error(error.message);
//         res.status(500).send("Internal Server Error");
// }
// })


// Route 2: Add a new seat using: POST /seats/addseats. Requires login
router.post('/addaseat', fetchuser, [
    body('seatNumber', 'Enter a seat number').isLength({ min: 2 }),
    body('seatLocation', 'Enter a valid location').isLength({ min: 3 }),

], async (req, res) => {
    try {
        const { seatNumber, seatLocation, seatStatus } = req.body;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.students.role !== "Superadmin") {
            return res.status(403).send({ error: "Unauthorized access" });
        }

        // Create a new seat with slots initialized to false and bookedBy set to null
        // Create a new seat
const newSeat = new Seat({
    seatNumber,
    seatLocation,
    seatStatus: {
        morning: { status: false, bookedBy: null },
        afternoon: { status: false, bookedBy: null },
        evening: { status: false, bookedBy: null },
        night: { status: false, bookedBy: null },
    },
});

// Iterate over each slot in seatStatus
for (const slotKey in seatStatus) {
    if (seatStatus.hasOwnProperty(slotKey)) {
        const slot = seatStatus[slotKey];

        // If a student is booked for the slot, search for the student by name
        if (slot.bookedBy) {
            const student = await Students.findOne({ uid: slot.bookedBy });

            if (!student) {
                return res.status(404).json({ error: `Student '${slot.bookedBy}' not found` });
            }

            // Update the bookedBy field with the student's ID
            newSeat.seatStatus[slotKey].bookedBy = student._id;
            newSeat.seatStatus[slotKey].status = true;
        } else {
            newSeat.seatStatus[slotKey].status = false;
        }
    }
}
        // Save the new seat to the database
        const savedSeat = await newSeat.save();

        res.json(savedSeat);
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
});



// // Route 3: Update seats using: PATCH /seats/updateseats. Requires login
// router.patch('/updateseats/:id', fetchuser, async (req, res) => {
//     const { seatNumber, seatLocation, seatStatus } = req.body;
//     if (req.students.role !== "Admin") {
//         return res.status(403).send({ error: "Unauthorized access" });
//       }
//     //create a newSeat object
//     const newSeat = {};
//     if(seatNumber){newSeat.seatNumber = seatNumber};
//     if(seatLocation){newSeat.seatLocation = seatLocation};
//     if(seatStatus){newSeat.seatStatus = seatStatus};

//     const seat = await Seat.findByIdAndUpdate(req.params.id, {$set: newSeat}, {new:true});
//     res.json({seat});
// })

router.patch('/updateseats/:id', fetchuser, async (req, res) => {
    const { seatNumber, seatLocation, seatStatus } = req.body;

    // Extract the slot information from seatStatus
    const slot = Object.keys(seatStatus)[0]; // Assuming only one slot is provided in the request

    // Check if the user is an admin
    if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
        return res.status(403).send({ error: "Unauthorized access" });
    }

    try {
        // Fetch the existing seat data from the database
        const existingSeat = await Seat.findById(req.params.id);

        // Create a newSeat object
        const newSeat = {};

        if (seatNumber) {
            newSeat.seatNumber = seatNumber;
        }

        if (seatLocation) {
            newSeat.seatLocation = seatLocation;
        }

        if (seatStatus) {
            // Retain existing seatStatus properties and update the specified ones
            newSeat.seatStatus = Object.assign({}, existingSeat.seatStatus, seatStatus);

            // Update 'status' based on 'bookedBy'
            Object.keys(newSeat.seatStatus).forEach(slot => {
                const { bookedBy } = newSeat.seatStatus[slot];
                newSeat.seatStatus[slot].status = bookedBy !== null;
            });
        }

        // Update the seat in the database
        const seat = await Seat.findByIdAndUpdate(req.params.id, { $set: newSeat }, { new: true });
        console.log(newSeat);


        // Find the slot with bookedBy not null
        const [bookedSlotName, slotData] = Object.entries(seatStatus)[0]; // Destructure the first entry
        const userId = slotData.bookedBy;
        console.log(userId)
        console.log(bookedSlotName)



        // First, find the student to see if there's an existing assignment for the slot
        const student = await Students.findOne({ uid: userId });
        if (student) {
            const assignmentIndex = student.seatAssigned.findIndex((assignment) => assignment.slot === bookedSlotName);
            if (assignmentIndex !== -1) {
                // Update existing assignment
                student.seatAssigned[assignmentIndex].seatNumber = seat.seatNumber;
            } else {
                // Add new assignment
                student.seatAssigned.push({ seatNumber: seat.seatNumber, slot: bookedSlotName });
            }
            const updatedStudent = await student.save(); // Save the updated student document
            res.json({ seat, updatedStudent });
        } else {
            res.json({ seat });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
});


  // Route 3: Delete seats using: DELETE /seats/deleteseats. Requires login
router.delete('/deleteseats/:id', fetchuser, async (req, res) => {
    try{
        if (req.students.role !== "Superadmin") {
            return res.status(403).send({ error: "Unauthorized access" });
          }
          let seat = await Seat.findById(req.params.id)
          if(seat == null) {
              return res.status(404).json({ message: 'Cannot find seat'})
          }
       seat = await seat.deleteOne()
        res.json({message: 'Seat Deleted', seat: seat})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
})

// Validity function
function setOneMonthValidity() {
    // Get the current date
    const currentDate = new Date();
  
    // Add one month to the current date
    // Note: The month in JavaScript Date is 0-indexed (0 for January, 1 for February, etc.)
    currentDate.setMonth(currentDate.getMonth() + 1);

    // Subtract one day to set the validity to the day before in the next month
    currentDate.setDate(currentDate.getDate() - 1);
  
    // Convert the date to a string or any other format as per requirement
    //const validityDate = currentDate.toISOString().substring(0, 10); // Format: YYYY-MM-DD
  
    // You can return this date or set it as validity date depending on your application's requirement
    return currentDate;
  }

// Router 4: New patch request to update seats and delete the previous one.
router.patch('/updateseatsdelete/:id', fetchuser, async (req, res) => {
    const { seatStatus } = req.body;
    const [bookedSlotName, slotData] = Object.entries(seatStatus)[0];
    const newUserId = slotData.bookedBy;
    const customValidityDate = slotData.seatValidTill;

    if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
        return res.status(403).send({ error: "Unauthorized access" });
    }

    try {
        // Calculate the new validity date based on user input or default function
        const newValidityDate = customValidityDate ? new Date(customValidityDate) : setOneMonthValidity();

        // First, check if newUserId corresponds to a valid student
        const newStudent = await Students.findOne({ uid: newUserId });
        if (!newStudent) {
            // If no student found, return an error response
            return res.status(404).send({ error: "No student with this user id found" });
        }
        // Update the seat in the database with new validity date
        const seat = await Seat.findById(req.params.id);
        seat.seatStatus[bookedSlotName].status = true;
        seat.seatStatus[bookedSlotName].bookedBy = newUserId;
        seat.seatStatus[bookedSlotName].seatValidTill = newValidityDate; // Update seatValidTill
        await seat.save();

        // Check all students to find any existing assignment for this seat and slot
        const studentsWithSeat = await Students.find({
            'seatAssigned.seatNumber': seat.seatNumber,
            'seatAssigned.slot': bookedSlotName,
        });

        // Remove this seat and slot assignment from any student who isn't the new assignee
        await Promise.all(studentsWithSeat.map(async (student) => {
            if (student.uid !== newUserId) {
                student.seatAssigned = student.seatAssigned.filter(assignment => !(assignment.seatNumber === seat.seatNumber && assignment.slot === bookedSlotName));
                await student.save();
            }
        }));

        // Assign the seat to the new student, ensuring to update if already exists or add if not
        // Since newStudent is already found, no need to find it again. Just update or add the seat assignment
            const assignmentIndex = newStudent.seatAssigned.findIndex(assignment => assignment.slot === bookedSlotName);
            if (assignmentIndex !== -1) {
                newStudent.seatAssigned[assignmentIndex].seatNumber = seat.seatNumber;
                newStudent.seatAssigned[assignmentIndex].validityDate = newValidityDate.toISOString().substring(0, 10); // Update validityDate for existing assignment
            } else {
                newStudent.seatAssigned.push({ seatNumber: seat.seatNumber, slot: bookedSlotName, validityDate: newValidityDate.toISOString().substring(0, 10), });
            }
            await newStudent.save();

        res.json({ seat, updatedStudent: newStudent });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
});

// Router 4(Backup): New patch request to update seats and delete the previous one.
// router.patch('/updateseatsdelete/:id', fetchuser, async (req, res) => {
//     const { seatStatus } = req.body;
//     const [bookedSlotName, slotData] = Object.entries(seatStatus)[0];
//     const newUserId = slotData.bookedBy;

//     if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
//         return res.status(403).send({ error: "Unauthorized access" });
//     }

//     try {
//         const newValidityDate = setOneMonthValidity(); // Get the new validity date
//         // First, check if newUserId corresponds to a valid student
//         const newStudent = await Students.findOne({ uid: newUserId });
//         if (!newStudent) {
//             // If no student found, return an error response
//             return res.status(404).send({ error: "No student with this user id found" });
//         }
//         // Update the seat in the database with new validity date
//         const seat = await Seat.findById(req.params.id);
//         seat.seatStatus[bookedSlotName].status = true;
//         seat.seatStatus[bookedSlotName].bookedBy = newUserId;
//         seat.seatStatus[bookedSlotName].seatValidTill = newValidityDate; // Update seatValidTill
//         await seat.save();

//         // Check all students to find any existing assignment for this seat and slot
//         const studentsWithSeat = await Students.find({
//             'seatAssigned.seatNumber': seat.seatNumber,
//             'seatAssigned.slot': bookedSlotName,
//         });

//         // Remove this seat and slot assignment from any student who isn't the new assignee
//         await Promise.all(studentsWithSeat.map(async (student) => {
//             if (student.uid !== newUserId) {
//                 student.seatAssigned = student.seatAssigned.filter(assignment => !(assignment.seatNumber === seat.seatNumber && assignment.slot === bookedSlotName));
//                 await student.save();
//             }
//         }));

//         // Assign the seat to the new student, ensuring to update if already exists or add if not
//         // Since newStudent is already found, no need to find it again. Just update or add the seat assignment
//             const assignmentIndex = newStudent.seatAssigned.findIndex(assignment => assignment.slot === bookedSlotName);
//             if (assignmentIndex !== -1) {
//                 newStudent.seatAssigned[assignmentIndex].seatNumber = seat.seatNumber;
//                 newStudent.seatAssigned[assignmentIndex].validityDate = newValidityDate.toISOString().substring(0, 10); // Update validityDate for existing assignment
//             } else {
//                 newStudent.seatAssigned.push({ seatNumber: seat.seatNumber, slot: bookedSlotName, validityDate: newValidityDate.toISOString().substring(0, 10), });
//             }
//             await newStudent.save();

//         res.json({ seat, updatedStudent: newStudent });
//     } catch (error) {
//         console.error(error.message);
//         res.status(500).send("Internal Server Error");
//     }
// });

// Router 5 when json has empty bookedBy field -- this is being used
router.patch('/emptyseat/:id', fetchuser, async (req, res) => {
    const { seatStatus } = req.body;
    const [bookedSlotName, slotData] = Object.entries(seatStatus)[0];
    const userId = slotData.bookedBy; // This can be an empty string for removal

    if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
        return res.status(403).send({ error: "Unauthorized access" });
    }

    try {
        // Fetch the seat to update
        const seat = await Seat.findById(req.params.id);
        if (!seat) {
            return res.status(404).send({ error: "Seat not found" });
        }

        if (userId) {
            // Process to assign seat to new student as before
            seat.seatStatus[bookedSlotName].bookedBy = userId;
            seat.seatStatus[bookedSlotName].status = true;
            await seat.save();
            // Additional logic to handle seat assignment (not shown for brevity)
        } else {
            // Clear the booking for the slot
            seat.seatStatus[bookedSlotName].bookedBy = null;
            seat.seatStatus[bookedSlotName].status = false;
            seat.seatStatus[bookedSlotName].seatValidTill = null;
            await seat.save();

            // Remove this seat and slot assignment from any student who currently has it
            const affectedStudents = await Students.find({
                'seatAssigned': {
                    $elemMatch: {
                        'seatNumber': seat.seatNumber,
                        'slot': bookedSlotName
                    }
                }
            });

            console.log(affectedStudents, "affacted student")

            for (let student of affectedStudents) {
                student.seatAssigned = student.seatAssigned.filter(assignment => 
                    !(assignment.seatNumber === seat.seatNumber && assignment.slot === bookedSlotName));
                await student.save();
            }
        }

        res.json({ seat });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
});





module.exports = router