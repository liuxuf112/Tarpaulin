const { Router } = require('express')
const { ValidationError } = require('sequelize')
const router = Router()
const crypto = require('crypto');
const { Course, User, Assignment, StudentsEnrolled, CourseClientFields } = require('../models/models');
const { requireAuthentication, requireAdmin, checkAdminOrSpecificInstructor } = require('./authorization')
const fs = require('fs');
const path = require('path')

/*
Returns the list of all Courses. This list should be paginated. 
The Courses returned should not contain the list of students in the Course or the list of Assignments for the Course.
*/
router.get('/', async function(req, res, _next) {
    let page = parseInt(req.query.page) || 1
    page = page < 1 ? 1 : page
    const numPerPage = 10


    const amountOfPages = (await Course.findAndCountAll({})).count;
    const lastPage = Math.ceil(amountOfPages / numPerPage)
    page = Math.min(lastPage, page);



    const offset = (page - 1) * numPerPage


    const whereClause = {}
    if (req.query.number) {
        whereClause.number = req.query.number
    }
    if (req.query.subject) {
        whereClause.subject_code = req.query.subject
    }
    if (req.query.term) {
        whereClause.term = req.query.term
    }


    const result = await Course.findAndCountAll({
        limit: numPerPage,
        offset: offset,
        where: whereClause

    })

    /*
     * Generate HATEOAS links for surrounding pages.
     */

    const links = {}
    links.firstPage = `/courses?page=1`;
    links.lastPage = `/courses?page=${lastPage}`

    if (page < lastPage) {
        links.nextPage = `/courses?page=${page + 1}`
    }
    if (page > 1) {
        links.prevPage = `/courses?page=${page - 1}`
    }

    /*
     * Construct and send response.
     */
    res.status(200).json({
        courses: result.rows,
        pageNumber: page,
        totalPages: lastPage,
        pageSize: numPerPage,
        totalCount: result.count,
        links: links
    })
})



/*
Creates a new Course with specified data and adds it to the application's database. 
Only an authenticated User with 'admin' role can create a new Course.
*/
router.post('/', requireAdmin, async function(req, res, _next) {
    req.body.subject_code = req.body.subject; //renaming an item because I named it wrong.
    req.body.instructor_id = req.body.instructorId;
    try {
        const course = await Course.create(req.body, CourseClientFields)

        res.status(201).send({ id: course.id })
    } catch (e) {
        if (e instanceof ValidationError) {

            res.status(400).send({ error: e.message })
        } else {
            console.log(e);
            res.status(500).send({ error: `Internal Server Error. Make sure the instructor with the given id: ${req.body.instructor_id} exists.` })
        }
    }
})


/*
Returns summary data about the Course, excluding the list of students enrolled in the course and the list of Assignments for the course
*/
router.get('/:courseid', async function(req, res, next) {
    const courseid = req.params.courseid
    const course = await Course.findByPk(courseid)
    if (course) {
        res.status(200).send(course)
    } else {
        next()
    }
})


/*
Performs a partial update on the data for the Course. Note that enrolled students and assignments cannot be modified via this endpoint. 
Only an authenticated User with 'admin' role or an authenticated 'instructor' User whose ID matches the instructorId of the Course can update Course information.
*/
//jacob check
//when verifying make sure to check both admin works as well as the instructor works
router.patch('/:courseid', requireAuthentication, async function(req, res, next) {
    const validToUpdate = await checkAdminOrSpecificInstructor(req, res, next, req.params.courseid || -1);
    if (!validToUpdate) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }

    const courseid = req.params.courseid
    req.body.course_id = courseid || undefined;
    req.body.instructor_id = req.body.instructorId || undefined;
    req.body.subject_code = req.body.subject || undefined;
    try {
        const result = await Course.update(req.body, {
            where: { id: courseid },
            fields: CourseClientFields
        })
        if (result[0] > 0) {
            res.status(204).send()
            return;
        } else {
            next()

            return;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Internal Server Error. Make sure the given instructor id exists."
        })
    }


})


/*
Completely removes the data for the specified Course, including all enrolled students, 
all Assignments, etc. Only an authenticated User with 'admin' role can remove a Course.
*/
router.delete('/:courseid', requireAdmin, async function(req, res, next) {
    const courseid = req.params.courseid
    try {

        const result = await Course.destroy({ where: { id: courseid } })
        if (result > 0) {
            res.status(204).send()
        } else {
            next()
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Internal Server Error. Please Try Again" })
    }


})


/*
Returns a list containing the User IDs of all students currently enrolled in the Course. 
Only an authenticated User with 'admin' role or an authenticated 'instructor' 
User whose ID matches the instructorId of the Course can fetch the list of enrolled students.
*/
router.get('/:courseid/students', requireAuthentication, async function(req, res, next) {
    const validToUpdate = await checkAdminOrSpecificInstructor(req, res, next, req.params.courseid || -1);
    console.log(`Valid to update: ${validToUpdate}`)
    if (!validToUpdate) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }


    const courseid = req.params.courseid
    const studentsFromDb = await StudentsEnrolled.findAll({ attributes: ['student_id'], where: { course_id: courseid } })
    const students = [];
    for (const student of studentsFromDb) {
        students.push(student.student_id);
    }
    res.status(200).json({ students });
})


/*
Enrolls and/or unenrolls students from a Course. Only an authenticated User with 'admin' role or an authenticated 
'instructor' User whose ID matches the instructorId of the Course can update the students enrolled in the Course.
*/
router.post('/:courseid/students', requireAuthentication, async function(req, res, next) {
    const validToUpdate = await checkAdminOrSpecificInstructor(req, res, next, req.params.courseid || -1);
    if (!validToUpdate) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }
    //if we get here we know it's valid. 
    if (!req.body || !req.body.add || !req.body.remove) {
        res.status(400).json({ error: "Invalid Request Body. Make sure you have included add and remove parameters" });
    }
    const adds = req.body.add || null; //list of IDs
    const removes = req.body.remove || null; //list of IDs

    //then we check if the course ID exists
    const course = await Course.findByPk(req.params.courseid);
    if (!course) {
        next(); //send it to the 404.
    } else {
        var addErrors = []
        var removeErrors = [];
        var studentsAdded = 0;
        var studentsRemoved = 0;
        try {
            if (adds) {

                for (const studentId of adds) {
                    try {
                        await StudentsEnrolled.create({ student_id: studentId, course_id: req.params.courseid })
                        studentsAdded += 1;
                    } catch (err) {
                        console.error(err);
                        addErrors.push(studentId)
                    }

                }
            }
            if (removes) {
                for (const studentId of removes) {
                    try {
                        const result = await StudentsEnrolled.destroy({
                            where: {
                                student_id: studentId
                            }
                        })
                        studentsRemoved += result;
                    } catch (err) {
                        console.error(err);
                        removeErrors.push(studentId);
                    }

                }
            }

            res.status(200).json({
                studentsAdded,
                studentsRemoved,
                addErrors,
                removeErrors
            }); //204 no content
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: "Internal Server Error. Please Try Again." })
        }
    }


})

/*
Returns a CSV file containing information about all of the students currently enrolled in the Course, 
including names, IDs, and email addresses. Only an authenticated User with 'admin' role 
or an authenticated 'instructor' User whose ID matches the instructorId of the Course can fetch the course roster.
*/

router.get('/:courseid/roster', requireAuthentication, async function(req, res, next) {
    const validToUpdate = await checkAdminOrSpecificInstructor(req, res, next, req.params.courseid || -1);
    if (!validToUpdate) {

        return; //we can just return because checkAdminOrSpecificInstructor sends error messages before returning false.
    }
    const dirLocation = path.join(__dirname, 'temp/');
    if (!fs.existsSync(dirLocation)) {
        fs.mkdirSync(dirLocation, { recursive: true });
    }
    const fileLocation = path.join(dirLocation, `${crypto.randomBytes(16).toString('hex')}.csv`);

    let fileContent = "";
    fileContent += "Student Id,Name,Email\n";
    const studentsEnrolled = await StudentsEnrolled.findAll({
        where: {
            course_id: req.params.courseid
        }
    })
    for (const studentEnrolled of studentsEnrolled) {
        const student = await User.findByPk(studentEnrolled.student_id);
        fileContent += `${student.id},${student.name},${student.email}\n`;
    }

    try {
        fs.writeFileSync(fileLocation, fileContent, { encoding: "utf8", flag: "w+" });
        res.status(200).sendFile(fileLocation, function(err) {
            if (err) {
                console.log(err);
            }
            fs.unlink(fileLocation, err => console.log(err));
        });


    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error. Please try again later." })
    }


})


/*
Returns a list containing the Assignment IDs of all Assignments for the Course.
*/

router.get('/:courseid/assignments', async function(req, res, next) {
    const courseid = req.params.courseid
    const course = await Course.findByPk(courseid);

    if (!course) { //if the course doesn't exist, send back "course ID doesn't exist"
        console.log(`User requested course id that does not exist: ${courseid}`)
        next() //goes to 404
        return;

    }
    const assignments = await Assignment.findAll({ where: { course_id: courseid } })

    res.status(200).json({
        assignments
    })

})

module.exports = router