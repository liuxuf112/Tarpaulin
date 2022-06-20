const { Router } = require('express')
const { ValidationError } = require('sequelize')
const bcrypt = require("bcrypt")
const router = Router()

const { User, userRoles, UserClientFields, Course, StudentsEnrolled } = require('../models/models');

const { validateUser, generateAuthToken, checkAdminForUserCreate, requireAuthentication } = require('./authorization')

/*
Create and store a new application User with specified data and adds it to the application's database. 
Only an authenticated User with 'admin' role can create users with the 'admin' or 'instructor' roles.
*/
router.post('/', checkAdminForUserCreate, async function(req, res, _next) {
    try {
        req.body.password = await bcrypt.hash(req.body.password, 8);
        //it should always be false, not settable by user.
        req.body.id = null;
        const user = await User.create(req.body, UserClientFields);
        res.status(201).send({ id: user.id });
        //once
    } catch (e) {
        if (e instanceof ValidationError) {
            res.status(400).send({ error: `${e.message} - The email may already be in use.` })
        } else if (e.name === 'SequelizeUniqueConstraintError') {
            res.status(403).send({ error: "User Already Exists" })
        } else {
            throw e
        }
    }
})


/*
Authenticate a specific User with their email address and password.
*/
router.post('/login', async function(req, res, _next) {
    if (req.body && req.body.email && req.body.password) {
        try {
            const authenticated = await validateUser(req.body.email, req.body.password);
            if (authenticated) {
                //if authenticated we want to get their password.
                const users = await User.findAll({ where: { email: req.body.email } })
                if (users.length == 0) {
                    throw "User email does not exist in database";
                }
                const token = generateAuthToken(users[0].id, users[0].role == userRoles.admin);
                res.status(200).send({ token: token });
            } else {
                res.status(401).send({
                    error: "Invalid authentication credentials"
                });
            }
        } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Error logging in. Try again later." })
        }
    } else {
        res.status(400).json({
            err: "Request body needs email and password."
        })
    }

})


/*
Returns information about the specified User. If the User has the 'instructor' role, the response should include a 
list of the IDs of the Courses the User teaches (i.e. Courses whose instructorId field matches the ID of this User). 
If the User has the 'student' role, the response should include a list of the IDs of the Courses the User is enrolled in. 
Only an authenticated User whose ID matches the ID of the requested User can fetch this information.
*/
router.get('/:uid', requireAuthentication, async function(req, res, next) {
    if (req.user != req.params.uid && !req.admin) {
        res.status(403).json({ error: "You can only request information about yourself." })
        return;
    }
    const user = await User.findByPk(req.params.uid);
    user.password = undefined;
    if (!user) {
        next();
    }
    let sendBody = { user };


    if (user.role == userRoles.instructor) {
        const courses = await Course.findAll({ where: { instructor_id: req.params.uid } })

        sendBody.teachingCourses = courses.map(course => course.get());
    } else if (user.role == userRoles.student) {
        const enrolledCourses = await StudentsEnrolled.findAll({
            where: {
                student_id: req.params.uid
            }
        })
        const cleanedCourses = enrolledCourses.map(x => x.get().course_id);
        sendBody.enrolledCourses = cleanedCourses;
    }
    console.log(sendBody);
    res.status(200).json(sendBody);
})

module.exports = router