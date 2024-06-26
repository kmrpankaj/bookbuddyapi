const express = require('express')
const router = express.Router()
const Students = require('../models/students')
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const JWT_SECRET = 'Myapplication1sNi$e'
var jwt = require('jsonwebtoken')
var fetchuser = require('../middleware/fetchuser');
const generateUsername = require('./uidgenerate')
const crypto = require('crypto');
const { Resend } = require('resend');
const resend = new Resend('re_KUJpjvYH_9M4jU7u1N25CKkAG4H8qRzmK');
const path = require('path');
const fs = require('fs'); // fs module to delete files
const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');
const auditLog = require('../middleware/auditlog')

const siteUrl = process.env.SITE_URL

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });


//==================================================================
//==================================================================


// Getting all
router.get('/showall/', fetchuser, async (req, res) => {
    
    try{
        if (!(req.students.role === "Admin" || req.students.role === "Superadmin")) {
            return res.status(403).send({ error: "Unauthorized access" });
          }
        const students = await Students.find()
        res.json(students)
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

//==================================================================
//==================================================================

// Getting one
router.get('/show/:id', getStudents, (req, res) => {
    res.send(res.students)
})


//==================================================================
//==================================================================

// This route will match requests to /show/uid/{uid}
router.get('/show/uid/:uid', getStudentByUid, (req, res) => {
    res.send(res.student);
});

async function getStudentByUid(req, res, next) {
    try {
        const uid = req.params.uid;
        // Use Mongoose to find a student by UID
        const student = await Students.findOne({ uid: uid });
        if (!student) {
            return res.status(404).send({ message: 'Student not found' });
        }
        res.student = student; // Attach the student to the response object
        next(); // Proceed to the next middleware function or route handler
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
    }
}


//==================================================================
//==================================================================

// Updated GET request to get logged-in student's data
router.get('/student-data/', fetchuser, async (req, res) => {
    try {
        // Now, req.students contains the student data from the JWT token.
        const studentId = req.students.id; // Assuming 'id' is stored in the token payload.
        
        // Fetch student data directly using the studentId obtained from the token
        const student = await Students.findById(studentId).select('-password'); // Exclude password from the result
        
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.send(student); // Send the found student data back
    } catch (error) {
        console.error(error.message); // Log the detailed error message
        res.status(500).send("Internal server error"); // Send a generic error message
    }
});


//==================================================================
//#################### Multer configurations #######################
//==================================================================


// Multer configurations
// Configure Multer
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//       cb(null, 'uploads/') // Make sure this directory exists
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         cb(null, uniqueSuffix + path.extname(file.originalname)); // Naming the file uniquely
//     }
//   });

//   const fileFilter = (req, file, cb) => {
//     // Accept images only
//     if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|heic)$/)) {
//       req.fileValidationError = 'Only image and pdf files are allowed!';
//       return cb(new Error('Only image and pdf files are allowed!'), false);
//     }
//     cb(null, true);
//   };

//   const upload = multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: 1024 * 1024 * 5 } }); // Limit of 5MB


//==================================================================
//################ Multer configurations with AWS ##################
//==================================================================

const upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: 'bookbuddyapiaws', // Replace with your S3 bucket name
      acl: 'public-read', // Adjust based on your permissions requirements
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: (req, file, cb) => {
        const contentType = file.mimetype; // Get mimetype from Multer
        //console.log(contentType)
        cb(null, { fieldName: file.fieldname, ContentType: contentType });
    },
      key: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        //console.log('Generated filename:', uniqueSuffix + path.extname(file.originalname)); // Log generated filename
        const studentUid = req.body.name.replace(/\s/g, '') ||'';
        const filename = `${studentUid}-${uniqueSuffix}${path.extname(file.originalname)}`;
        cb(null, filename);
      }
    }),
    fileFilter: (req, file, cb) => {
      // Accept images and pdf only
      if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|heic)$/)) {
        req.fileValidationError = 'Only image and pdf files are allowed!';
        return cb(new Error('Only image and pdf files are allowed!'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 1024 * 1024 * 5 } // Limit of 5MB
  });


//==================================================================
//############################ Signup ##############################
//==================================================================

// Route 2: Creating one with uploads: Signup
router.post('/create/', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documentid', maxCount: 1 }]), async (req, res) => {
    console.log('Files uploaded:', req.files);

    let success=false;
    let newUsername;
    // Loop until a unique username is found
    while (true) {
        newUsername = generateUsername(); // Generate a potential username

        // Check if the generated username is unique in the database
        const existingUser = await Students.findOne({ uid: newUsername });
        if (!existingUser) {
            // Unique username found, break the loop
            break;
        }
    }
    const salt = await bcrypt.genSalt(10);
    const secPass = await bcrypt.hash(req.body.password, salt);
    const avatar = getRandomAvatar(req.body.gender); //Assign random avatar

    // Access the files via req.files.photo[0] and req.files.documentid[0]
    const { photo = [], documentid = [] } = req.files; // Set defaults
    const photoPath = photo.length > 0 ? photo[0].location : '';
    const documentPath = documentid.length > 0 ? documentid[0].location : '';

      // Log the uploaded file URLs
//   console.log('Photo URL:', photoPath);
//   console.log('Document ID URL:', documentPath);

    const students = new Students({
        name: req.body.name,
        email: req.body.email,
        gender: req.body.gender,
        password: secPass,
        address: req.body.address,
        phone: req.body.phone,
        parentsphone: req.body.parentsphone,
        photo: photoPath,
        documentid: documentPath,
        uid: newUsername,
        regisDate: req.body.regisDate,
        role: req.body.email === process.env.THALAIVA ? "Superadmin" : req.body.role || "Student",
        avatar: avatar // Set the avatar field
    })
    const data = {
        students: {
            id: students.id
        }
    }
    
        const [user, phone] = await Promise.all([Students.findOne({ email: req.body.email }), Students.findOne({ phone: req.body.phone })]);
        if(user || phone) {
            return user ? res.status(400).json({ error: "Sorry, a user with this email already exists." }) : phone ? res.status(400).json({ error: "Sorry, a user with this phone number already exists." }) : "";
        }

        try {
        const newStudents = await students.save()
        const authToken = jwt.sign(data, JWT_SECRET)
        success=true;
        res.status(201).json({success, authToken, newStudents})
    } catch (err){
        success=false;
        next(err);
    }
    //console.log('Reached upload route handler!');
}, (error, req, res, next) => { // Error handling middleware
    if (error instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        let message = 'An error occurred during the file upload.';
        if (error.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large. Please upload a file smaller than 5MB.';
        } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Too many files uploaded.';
        } else {
            message = error.message;
        }
        return res.status(400).json({ success: false, message: message });
    } else if (req.fileValidationError) {
        // An error occurred during file validation
        return res.status(400).json({ success: false, message: req.fileValidationError });
    } else if (error) {
        // An unknown error occurred
        return res.status(500).json({ success: false, message: error.message });
    }
    // If there's no error, pass control to the next handler (if any)
    next();
})


//==================================================================
//#################### checking unique email #######################
//==================================================================
router.post('/check-email', async (req, res) => {
    const { email } = req.body;
    try {
      const existingUser = await Students.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ available: false, message: "Email already exists." });
      }
      return res.status(200).json({ available: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

//==================================================================
//#################### checking unique email #######################
//==================================================================
router.post('/check-phone', async (req, res) => {
    const { phone } = req.body;
    try {
      const existingUser = await Students.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ available: false, message: "Phone number already exists." });
      }
      return res.status(200).json({ available: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
//==================================================================
//############################ Update ##############################
//==================================================================


// updating one
router.patch('/update/:id', fetchuser, getStudents, auditLog, upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documentid', maxCount: 1 }]), async (req, res) => {
    req.model = Students;

    try {
        // Existing student data is expected to be attached to the response by the 'getStudents' middleware
        const student = res.students;
        //console.log(req.files, "hello reqfiles");

        // Dynamically update provided fields, except 'photo' and 'documentid' to handle them separately
        Object.keys(req.body).forEach(key => {
            if (!['photo', 'documentid', 'accountStatus'].includes(key)) {
                student[key] = req.body[key];
            }
        });

        // Specifically handle 'accountStatus' if provided
        if ('accountStatus' in req.body) {
            student.accountStatus = req.body.accountStatus === 'true' ? true : req.body.accountStatus === 'false' ? false : student.accountStatus;
        }

        // Handle photo update and deletion
        if (req.files['photo'] && req.files['photo'][0]) {
            if (student.photo && fs.existsSync(student.photo)) {
                fs.unlink(student.photo, (err) => {
                    if (err) console.error(`Failed to delete old photo: ${student.photo}`, err);
                });
            }
            student.photo = req.files['photo'][0].location;
        }

        // Handle document update and deletion
        if (req.files['documentid'] && req.files['documentid'][0]) {
            if (student.documentid && fs.existsSync(student.documentid)) {
                fs.unlink(student.documentid, (err) => {
                    if (err) console.error(`Failed to delete old document: ${student.documentid}`, err);
                });
            }
            student.documentid = req.files['documentid'][0].location;
        }

        // Save the updated student data
        const updatedStudent = await student.save();
        res.json({ success: true, updatedStudent });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, message: "Failed to update student", error: err.message });
        next(err);
    }
    }, (error, req, res, next) => { // Dedicated error handling for the update route
        if (error instanceof multer.MulterError) {
            // Handle Multer-specific errors
            let message = 'An error occurred during the file upload.';
            if (error.code === 'LIMIT_FILE_SIZE') {
                message = 'File too large. Please upload a file smaller than 5MB.';
            } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
                message = 'Too many files uploaded.';
            } else {
                message = error.message;
            }
            return res.status(400).json({ success: false, message: message });
        } else if (req.fileValidationError) {
            // Handle file validation errors
            return res.status(400).json({ success: false, message: req.fileValidationError });
        } else if (error) {
            // Handle any other errors
            return res.status(500).json({ success: false, message: error.message });
        }
        // If there's no error, pass control to the next middleware (if any)
        next();
    });

//==================================================================
//==================================================================


// PATCH endpoint to toggle a student's account status
router.patch('/toggleacStatus/:id', fetchuser, auditLog, async (req, res) => {
    req.model = Students;
    const { id } = req.params; // Student ID from URL
    const { accountStatus } = req.body; // New account status from request body
  
    try {
      // Find the student by ID and update
      const student = await Students.findById(id);
  
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
  
      // Update the account status
      student.accountStatus = accountStatus;
      await student.save();
  
      res.json({ success: true, message: "Account status updated successfully", updatedStudent: student });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error while updating account status" });
    }
  });

//==================================================================
//==================================================================


// Deleting one
router.delete('/delete/:id', fetchuser, getStudents, auditLog, async (req, res) => {
    req.model = Students;
    let success=false
    try{
        if (req.students.role !== "Superadmin") {
            return res.status(403).send({ error: "Unauthorized access" });
          }
        await res.students.deleteOne()
        success=true
        res.json({success, message: 'Deleted Student'})
    } catch (err) {
        success=false
        res.status(500).json({success, message: err.message})
    }
})

// Get student function
async function getStudents(req, res, next) {
    let students
    try {
        students = await Students.findById(req.params.id)
        if(students == null) {
            return res.status(404).json({ message: 'Cannot find student'})
        }
    } catch (err) {
        return res.status(500).json({message: err.message})
    }
    res.students = students
    next()
}



//==================================================================
//==================================================================


// Route 2: Authenticate a user using /students/login
router.post('/login', [
    body('email', 'Enter a valid email').isEmail(),
    body('password', 'Password cant be blank').exists(),
], async (req, res) => {
    let success = false;
    // if there are errors, return bad request and the errors
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({errors: errors.array()})
    }
    const {email,password} = req.body
    try {
        let user = await Students.findOne({email});
        if(!user){
            return res.status(400).json({error: "Please try to login with correct credentials."})
        }

        // Check if the user's accountStatus is false
        if (user.accountStatus === false) {
            return res.status(401).json({success, error: "Login is disabled for this account."});
        }

        const passwordCompare = await bcrypt.compare(password, user.password);
        if(!passwordCompare){
            success = false
            return res.status(400).json({success, error: "Please try to login with correct credentials."})
        }

        const data = {
            students: {
                id: user.id,
                role: user.role,
            }
        }
        const authToken = jwt.sign(data, JWT_SECRET);
        success = true;
        const therole = data.students.role
        res.json({success, authToken, therole});

    } catch (error) {
        console.error(error.message)
        res.status(500).send("Internal server error")
    }
})


//==================================================================
//==================================================================


// Route 3: Get logged in user details /students/getuser. Requires login
router.post('/getuser', fetchuser, async (req, res) => {
    try {
        const userId = req.students.id;
        const user = await Students.findById(userId).select("-password")
        res.json({user});
    } catch (error) {
        console.error(error);
        return res.status(500).json({message: error.message})
    }
})


//==================================================================
//==================================================================


// Route 4: Creating multiple students /students/addmultiple. Requires Admin login
router.post('/addmultiple/', async (req, res) => {
    const studentsArray = req.body; // Assuming an array of students is sent in the request body

    // Array to store the created students
    const createdStudents = [];

    for (const studentData of studentsArray) {
        let newUsername;

        // Loop until a unique username is found
        while (true) {
            newUsername = generateUsername(); // Generate a potential username

            // Check if the generated username is unique in the database
            const existingUser = await Students.findOne({ uid: newUsername });
            if (!existingUser) {
                // Unique username found, break the loop
                break;
            }
        }

        const salt = await bcrypt.genSalt(10);
        const secPass = await bcrypt.hash(studentData.password, salt);

        const students = new Students({
            name: studentData.name,
            email: studentData.email,
            gender: studentData.gender,
            password: secPass,
            address: studentData.address,
            phone: studentData.phone,
            parentsphone: studentData.parentsphone,
            photo: studentData.photo,
            documentid: studentData.documentid,
            uid: newUsername,
            regisDate: studentData.regisDate,
            role: studentData.role
        });

        try {
            // Check if a user with the same email or phone already exists
            const [user, phone] = await Promise.all([
                Students.findOne({ email: studentData.email }),
                Students.findOne({ phone: studentData.phone })
            ]);

            if (user || phone) {
                return user
                    ? res.status(400).json({ error: "Sorry, a user with this email already exists." })
                    : phone
                    ? res.status(400).json({ error: "Sorry, a user with this phone number already exists." })
                    : "";
            }

            const newStudent = await students.save();
            createdStudents.push(newStudent); // Add the created student to the array
        } catch (err) {
            res.status(400).json({ message: err.message });
        }
    }

    res.status(201).json(createdStudents);
});


//==================================================================
//==================================================================


// Generate reset token for forgot password
const generateResetToken = () => {
    return crypto.randomBytes(20).toString('hex');
  };


//==================================================================
//==================================================================


  //send email

  const sendResetEmail = async (to, resetLink) => {
    const subject = "Password Reset Request";
    const html = `<p>You requested to reset your password. Click the link below to set a new password:</p>
                  <a href="${resetLink}">${resetLink}</a>
                  <p>If you didn't request this, please ignore this email.</p>`;
  
    // Using the Resend client initialized in your email.js
    const { data, error } = await resend.emails.send({
      from: '"BookBuddy" <info@bookbuddy.co.in>', // Sender email address
      to: to, // Recipient email address
      subject: subject,
      html: html,
    });
  
    if (error) {
      console.error("Failed to send reset email:", error);
      throw new Error("Email sending failed");
    }
  
    console.log("Reset email sent successfully", data);
  };


//==================================================================
//==================================================================


// Route 5: forgot password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
      let user = await Students.findOne({ email });
      if (!user) {
        return res.status(400).json({ error: "User not found." });
      }
  
      // Generate reset token and expiry (implementation depends on your setup)
      const resetToken = generateResetToken();
      const expiryTime = Date.now() + (6 * 3600000); // 6 hour from now
  
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = expiryTime;
      await user.save();
  
      // Send email (implementation depends on your email service)
      sendResetEmail(user.email, `https://${siteUrl}/resetpassword?token=${resetToken}`);
  
      res.json({ success: true, message: "A reset link has been sent to your registered email." });
    } catch (error) {
      console.error(error.message);
      res.status(500).send("Internal server error");
    }
  });



//==================================================================
//==================================================================

// Route 6 /reset-password endpoint
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
  
    try {
        // Find user by resetPasswordToken and ensure token hasn't expired
        const user = await Students.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
  
        if (!user) {
            return res.status(400).json({ error: "Password reset token is invalid or has expired." });
        }
  
        // Generate a new hash for the new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
  
        // Clear the resetPasswordToken and resetPasswordExpires fields
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
  
        await user.save();
  
        // Respond to the request indicating the password was reset successfully
        res.json({ success: true, message: "Password has been reset successfully." });
  
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal server error");
    }
});


// Function to generate a random avatar
function getRandomAvatar(gender) {
    // Define lists of avatar filenames for each gender
    const femaleAvatars = ["avatarf1", "avatarf2", "avatarf3", "avatarf4", "avatarf5"];
    const maleAvatars = ["avatarm1", "avatarm2", "avatarm3", "avatarm4"];
  
    // Select the appropriate list based on gender
    const avatarList = gender.toLowerCase() === "female" ? femaleAvatars : maleAvatars;
  
    // Choose a random avatar from the selected list
    const randomIndex = Math.floor(Math.random() * avatarList.length);
    const randomAvatar = avatarList[randomIndex];
  
    return randomAvatar;
  }

  // Endpoint to update all students with a random avatar based on gender
// router.get('/update-avatars',  async (req, res) => {
//     try {
//         const studenty = await Students.find(); // Fetch all students

//         const updatePromises = studenty.map(student => {
//             student.avatar = getRandomAvatar(student.gender); // Assign a random avatar based on gender
//             return student.save(); // Save the updated student
//         });

//         await Promise.all(updatePromises);
//         res.send('All avatars updated based on gender');
//     } catch (error) {
//         console.error('Error updating avatars:', error);
//         res.status(500).send('Error updating avatars');
//     }
// });





module.exports = router
