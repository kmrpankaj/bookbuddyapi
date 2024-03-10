require('dotenv').config()
var cors = require('cors')
const express = require('express');
const app = express();
const mongoose = require('mongoose');


mongoose.connect(process.env.DATABASE_URL)
const db = mongoose.connection
const port = process.env.PORT
db.on('error', (error) => console.error(error))
db.once('open', () => console.log('connected to database')) // always use mongod --dbpath /srv/mongodb/
app.use(cors())
app.use(express.json())

// Available Routes
const studentsRouter = require('./routes/students')
app.use('/students', studentsRouter)
'localhost:3001/students'
const seatsRouter = require('./routes/seats')
app.use('/seats', seatsRouter)
'localhost:3001/seats'
const bookingRouter = require('./routes/bookings')
app.use('/bookings', bookingRouter)
'localhost:3001/bookings'
const emailRoutes = require('./routes/email')
app.use('/email', emailRoutes)
app.use('/uploads', express.static('uploads'));


app.listen(port, () => console.log(`server Started at http://localhost:${port}`));
