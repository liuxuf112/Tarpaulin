const { DataTypes } = require('sequelize')

const sequelize = require('../lib/sequelize')


const Assignment = sequelize.define('assignment', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    due_date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

})


exports.Assignment = Assignment

exports.AssignmentClientFields = [
    'due_date',
    'title',
    'points',
    'course_id'
]





const User = sequelize.define('user', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    role: { //0 - student, 1 - instructor, 2 - admin
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
})

const roles = {
    "student": 0,
    "instructor": 1,
    "admin": 2
}
exports.userRoles = roles;


exports.User = User
exports.UserClientFields = [
    "role",
    "name",
    "email",
    "password"
]


const Submission = sequelize.define('submission', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    submit_time_stamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    file_link: {
        type: DataTypes.STRING,
        allowNull: false
    },
    grade: {
        type: DataTypes.DOUBLE,
        allowNull: true
    },


})



exports.Submission = Submission
exports.SubmissionClientFields = [
    'submit_time_stamp',
    'file_link',
    'grade',
    'student_id',
    'assignment_id'
]


const StudentsEnrolled = sequelize.define('student_enrolled', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    }

})


exports.StudentsEnrolled = StudentsEnrolled
exports.StudentsEnrolledClientFields = [
    'course_id',
    'student_id'
]



const Course = sequelize.define('course', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    subject_code: {
        type: DataTypes.STRING,
        allowNull: false
    },
    number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    term: {
        type: DataTypes.STRING,
        allowNull: false
    }
})
exports.Course = Course
exports.CourseClientFields = [
    'subject_code',
    'number',
    'title',
    'term',
    'instructor_id'
]


Course.belongsToMany(User, {
    through: StudentsEnrolled,
    foreignKey: "course_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE"
})

Course.belongsTo(User, {
    foreignKey: "instructor_id",
})
User.belongsToMany(Course, {
    through: StudentsEnrolled,
    foreignKey: "student_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE"
})
Submission.belongsTo(Assignment, {
    foreignKey: "assignment_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE"
})
Submission.belongsTo(User, {
    foreignKey: "student_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE"
})

Assignment.belongsTo(Course, {
    foreignKey: "course_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE"
});