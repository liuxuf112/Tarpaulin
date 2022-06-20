const jwt = require('jsonwebtoken');
const secretKey = 'SuperSecret';
const bcrypt = require('bcrypt');
const { userRoles, User, Course } = require('../models/models');

async function validateUser(email, password) {
    email = email || ""; //setting default values.
    password = password || "";
    const users = await User.findAll({ where: { email: email } })

    if (users.length == 0) {
        return false;
    }
    const dbUser = users[0];
    try {
        const match = await bcrypt.compare(password, dbUser.password);
        if (match) {
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.error(`Error comparing passwords: ${e}`);
        return false;
    }
}

function requireAuthentication(req, res, next) {
    const authHeader = req.get('Authorization') || '';
    const authHeaderParts = authHeader.split(' ');

    const token = authHeaderParts[0] === 'Bearer' ?
        authHeaderParts[1] : null;
    try {
        const payload = jwt.verify(token, secretKey);
        req.user = payload.sub;
        req.admin = payload.admin
        next();
    } catch (err) {
        res.status(401).json({
            error: "Invalid authentication token provided."
        });

    }

}

//TODO: Implement Instructors
function requireAdmin(req, res, next) {
    const authHeader = req.get('Authorization') || '';
    const authHeaderParts = authHeader.split(' ');

    const token = authHeaderParts[0] === 'Bearer' ?
        authHeaderParts[1] : null;
    try {
        const payload = jwt.verify(token, secretKey);
        if (payload.admin) {

            req.body.role = userRoles[req.body.role];
            next()
        } else {
            res.status(403).json({
                error: "You are not authorized to make this request"
            });

        }


    } catch (err) {
        res.status(403).json({
            error: "Invalid authentication token provided."
        });

    }
}

//For patching a course
//returns true if admin or specific instructor
//returns false otherwise.
async function checkAdminOrSpecificInstructor(req, res, next, courseId) {

    const course = await Course.findByPk(courseId);

    if (!course) { //if the course doesn't exist, send back "course ID doesn't exist"
        console.log(`User requested course id that does not exist: ${courseId}`)
        next() //goes to 404
        return false;

    }

    if (req.admin) {
        //then we're good to go.
        return true;
    } else {
        //then we need to look up if this user is an instructor for the given course.

        //then w get the course.
        if (course.instructor_id === req.user) {


            return true;

        } else {
            res.status(403).send({
                error: `Unauthorized to edit or receive specific information about course id ${courseId}`
            })
            return false

        }




    }
}

//used for creating admins only.
function checkAdminForUserCreate(req, res, next) {
    if (!(req.body.role in userRoles)) {
        res.status(400).json({
            error: "Incorrect Role Type."
        })
        return;
    }
    if (req.body.role === "admin" || req.body.role === "instructor") {
        //check if user is an admin
        const authHeader = req.get('Authorization') || '';
        const authHeaderParts = authHeader.split(' ');

        const token = authHeaderParts[0] === 'Bearer' ?
            authHeaderParts[1] : null;
        try {
            const payload = jwt.verify(token, secretKey);
            if (payload.admin) {
                req.body.role = userRoles[req.body.role];
                next()
            } else {
                res.status(401).json({
                    error: "You are not authorized to create an admin user."
                });

            }


        } catch (err) {
            res.status(401).json({
                error: "Invalid authentication token provided."
            });

        }


    } else {
        req.body.role = userRoles["student"]
        next()
    }
}


function generateAuthToken(id, admin) {
    //TODO: should add the user role in here as well.
    const payload = {
        sub: id,
        admin: admin
    };
    return jwt.sign(payload, secretKey, { expiresIn: '24h' });

}
exports.validateUser = validateUser;
exports.checkAdminForUserCreate = checkAdminForUserCreate;
exports.checkAdminOrSpecificInstructor = checkAdminOrSpecificInstructor;
exports.requireAdmin = requireAdmin;
exports.generateAuthToken = generateAuthToken;
exports.requireAuthentication = requireAuthentication;
exports.secretKey = secretKey;