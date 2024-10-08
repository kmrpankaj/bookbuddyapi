require('dotenv').config();
var cors = require('cors');
const express = require('express');
const app = express();
const mongoose = require('mongoose');

mongoose.connect(process.env.DATABASE_URL);
const db = mongoose.connection;
const port = process.env.PORT || 3001; // Added default port if process.env.PORT is not set

db.on('error', (error) => console.error(error));
db.once('open', () => {
    console.log('Connected to database');

    // Start listening only after database connection is established
    app.listen(port, () => console.log(`Server started at http://localhost:${port}`));
});

app.use(cors());
app.use(express.json());
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Route for the homepage to redirect to the frontend homepage
app.get('/', (req, res) => {
    res.redirect(process.env.SITE_URL);
});

// Model-setting middleware
const Students = require('./models/students');
const Seat = require('./models/seats');
const Bookings = require('./models/bookings'); // Example path
app.use((req, res, next) => {
    if (req.path.startsWith('/students')) {
        req.model = Students;
    } else if (req.path.startsWith('/seats')) {
        req.model = Seat;
    } else if (req.path.startsWith('/bookings')) {
        req.model = Bookings;
    }
    next();
});

// Available Routes
const studentsRouter = require('./routes/students');
app.use('/students', studentsRouter);

const seatsRouter = require('./routes/seats');
app.use('/seats', seatsRouter);

const bookingRouter = require('./routes/bookings');
app.use('/bookings', bookingRouter);

const couponRouter = require('./routes/coupons');
app.use('/coupons', couponRouter);

const activityRouter = require('./routes/activity');
app.use('/activity', activityRouter);

const emailRoutes = require('./routes/email');
app.use('/email', emailRoutes);

app.use('/uploads', express.static('uploads'));




