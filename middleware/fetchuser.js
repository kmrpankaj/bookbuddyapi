const jwt = require('jsonwebtoken');
const JWT_SECRET = 'Myapplication1sNi$e';
const console = require('console');

// Function for students
const fetchuser = (req, res, next) => {
    //Get the user from the jwt token and add id to req object

    try {
        const token = req.header('auth-token');
        //console.log(token)
        //console.log(req.headers)
        if (!token) {
            res.status(401).send({ error: "Please authenticate using a valid token" });
        }
        const data = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.students = data.students;
        //console.log("Student Role:", req.students.role); // Log the role here
        next();
    } catch (error) {
        console.error(error);
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).send({ error: "Invalid token" });
        } else {
            // Handle other errors
            return res.status(500).send({ error: "Internal Server Error" });
        }
    }

}

// Export both functions
module.exports = fetchuser;