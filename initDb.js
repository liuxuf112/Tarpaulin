const sequelize = require('./lib/sequelize')
const {
    Course,
    CourseClientFields,
    StudentsEnrolled,
    StudentsEnrolledClientFields,
    User,
    UserClientFields,
    Assignment,
    AssignmentClientFields,
    Submission,
    SubmissionClientFields
} = require('./models/models')

const courseData = require('./data/courses.json')
const userData = require('./data/users.json')
const assignmentData = require('./data/assignments.json')
const studentsEnrolledData = require('./data/students_enrolled.json')
const submissionData = require('./data/submissions.json')

const bcrypt = require('bcrypt')

sequelize.sync().then(async function() {
    for (const user of userData) {

        user.password = await bcrypt.hash(user.password, 8);
        try {
            await User.create(user, { fields: UserClientFields })
        } catch (e) {
            console.log(`Error creating user: ${e}`)
        }

    }
    try {
        await Course.bulkCreate(courseData, { fields: CourseClientFields })
    } catch (err) {
        console.error(`\n\nError bulk creating courses: ${err}\n\n`)
    }
    try {
        await StudentsEnrolled.bulkCreate(studentsEnrolledData, { fields: StudentsEnrolledClientFields })
    } catch (err) {
        console.error(`\n\nError bulk creating students enrolled: ${err}\n\n`)
    }
    try {
        await Assignment.bulkCreate(assignmentData, { fields: AssignmentClientFields })

    } catch (err) {
        console.error(`\n\nError bulk creating assignments: ${err}\n\n`);
    }
    try {
        await Submission.bulkCreate(submissionData, { fields: SubmissionClientFields })

    } catch (err) {
        console.error(`\n\nError bulk creating submissions: ${err}\n\n`)
    }


})