const { Router } = require('express')
const { ValidationError } = require('sequelize')
const { AssignmentClientFields, Assignment, Submission, SubmissionClientFields, User, userRoles, StudentsEnrolled } = require('../models/models')
const { requireAuthentication, requireAdmin, checkAdminOrSpecificInstructor } = require('./authorization')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const router = Router()

/*
Create and store a new Assignment with specified data and adds it to the application's database. 
Only an authenticated User with 'admin' role or an authenticated 'instructor' User whose ID matches 
the instructorId of the Course corresponding to the Assignment's courseId can create an Assignment.
*/
router.post('/', requireAuthentication, async function(req, res, next) {
    if (!req.body || !req.body.courseId) {
        res.status(400).json({ error: "Course ID not provided within body" })
        return;
    }
    const validToPost = await checkAdminOrSpecificInstructor(req, res, next, req.body.courseId || -1);
    if (!validToPost) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }
    req.body.due_date = req.body.due;
    req.body.course_id = req.body.courseId;
    try {
        const assignment = await Assignment.create(req.body, AssignmentClientFields)
        res.status(201).send({ id: assignment.id })
    } catch (e) {
        if (e instanceof ValidationError) {
            res.status(400).send({ error: e.message })
        } else {
            throw e
        }
    }
})

/*
Returns summary data about the Assignment, excluding the list of Submissions.
*/
router.get('/:assignmentid', async function(req, res, next) {
    const assignmentId = req.params.assignmentid
    const assignment = await Assignment.findByPk(assignmentId)
    if (assignment) {
        res.status(200).send(assignment)
    } else {
        next()
    }
})

/*
Performs a partial update on the data for the Assignment. Note that submissions cannot be modified via this endpoint. 
Only an authenticated User with 'admin' role or an authenticated 'instructor' User whose ID matches the instructorId 
of the Course corresponding to the Assignment's courseId can update an Assignment.
*/
router.patch('/:assignmentid', requireAuthentication, async function(req, res, next) {

    const assignmentId = req.params.assignmentid
        //first we need to get the class associated with the assignment, then we can check instructor.
    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
        next(); //can't find assignment
        return;
    }
    const validToPost = await checkAdminOrSpecificInstructor(req, res, next, assignment.course_id || -1);
    if (!validToPost) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }

    const result = await Assignment.update(req.body, {
        where: { id: assignmentId },
        fields: AssignmentClientFields
    })

    if (result[0] > 0) {
        res.status(204).send()
    } else {
        next()
    }
})

/*
Completely removes the data for the specified Assignment, including all submissions. Only an authenticated User with 'admin' 
role or an authenticated 'instructor' User whose ID matches the instructorId of the Course corresponding to the Assignment's 
courseId can delete an Assignment.
*/
router.delete('/:assignmentid', requireAuthentication, async function(req, res, next) {
    const assignmentId = req.params.assignmentid
    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
        next(); //can't find assignment
        return;
    }
    const validToPost = await checkAdminOrSpecificInstructor(req, res, next, assignment.course_id || -1);
    if (!validToPost) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }
    const result = await Assignment.destroy({
        where: { id: assignmentId }
    })

    if (result > 0) {
        res.status(204).send()
    } else {
        next()
    }
})

/*
Returns the list of all Submissions for an Assignment. This list should be paginated. Only an authenticated User with 'admin' 
role or an authenticated 'instructor' User whose ID matches the instructorId of the Course corresponding to the Assignment's 
courseId can fetch the Submissions for an Assignment.
*/
router.get('/:assignmentid/submissions', requireAuthentication, async function(req, res, next) {
    let page = parseInt(req.query.page) || 1
    page = page < 1 ? 1 : page
    const numPerPage = 10
    const offset = (page - 1) * numPerPage
    
    const assignmentId = req.params.assignmentid
    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
        next(); //can't find assignment
        return;
    }
    const validToPost = await checkAdminOrSpecificInstructor(req, res, next, assignment.course_id || -1);
    if (!validToPost) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }
    const result = await Submission.findAndCountAll({
        limit: numPerPage,
        offset: offset,
        where: { assignment_id: assignmentId }
    })

    /*
     * Generate HATEOAS links for surrounding pages.
     */
    const lastPage = Math.ceil(result.count / numPerPage)
    const links = {}

    if (page < lastPage) {
        links.nextPage = `/assignments/${assignmentId}/submissions?page=${page + 1}`
        links.lastPage = `/assignments/${assignmentId}/submissions?page=${lastPage}`
    }
    if (page > 1) {
        links.prevPage = `/assignments/${assignmentId}/submissions?page=${page - 1}`
        links.firstPage = `/assignments/${assignmentId}/submissions?page=1`;
    }

    res.status(200).json({
        submissions: result.rows,
        pageNumber: page,
        totalPages: lastPage,
        pageSize: numPerPage,
        totalCount: result.count,
        links: links
    })
})

/*
Create and store a new Assignment with specified data and adds it to the 
application's database. Only an authenticated User with 'student' role who is 
enrolled in the Course corresponding to the Assignment's courseId can create a Submission.
*/
router.post('/:assignmentid/submissions', requireAuthentication, async function(req, res, next) {
    req.body.grade = undefined;
    req.body.assignment_id = req.body.assignmentId;
    req.body.student_id = req.body.studentId;
    req.body.submit_time_stamp = req.body.timestamp;

    const user = await User.findByPk(req.user);
    if (req.body.studentId != req.user) {
        res.status(403).json({ error: "You cannot submit a submission for a different student." })
        return;
    }
    if (user.role !== userRoles.student) {
        res.status(403).json({ error: "Only students can make submissions" })
        return;
    }
    const assignment = await Assignment.findByPk(req.params.assignmentid)
    if (!assignment) { //if there's no assignment
        next();
        return;
    }
    const enrolledStudent = StudentsEnrolled.findAll({
        where: {
            student_id: user.id,
            course_id: assignment.course_id
        }
    })
    if (!enrolledStudent) { //if they're not enrolled in the course
        res.status(403).json({ error: "You are not enrolled in this course." });
        return;
    }


    //then we can actually submit the thingy.


    //First we write the base64 data to a pdf.
    const fileName = `${user.name}_${crypto.randomBytes(16).toString('hex')}.pdf`.replace(' ', '_');
    const dirLocation = path.join(__dirname, 'submissions/');
    if (!fs.existsSync(dirLocation)) {
        fs.mkdirSync(dirLocation, { recursive: true });
    }
    const fileLocation = path.join(dirLocation, fileName);
    console.log(fileLocation);
    try {
        fs.writeFileSync(fileLocation, req.body.file, { encoding: "base64", flag: "w+" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Error writing file. Please make sure it is a base64 encoded pdf." })
        return;
    }
    req.body.file_link = `/submissions/${fileName}`;
    try {
        const submission = await Submission.create(req.body, SubmissionClientFields)
        res.status(201).send({ id: submission.id })
        return;
    } catch (e) {
        if (e instanceof ValidationError) {
            res.status(400).send({ error: e.message })
            return;
        } else {
            throw e
        }
    }
})

module.exports = router