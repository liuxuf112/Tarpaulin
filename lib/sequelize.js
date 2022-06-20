const { Sequelize } = require('sequelize')
    //const setUpAssociations = require('../models/associations')



const sequelize = new Sequelize({
        dialect: 'mysql',
        host: process.env.MYSQL_HOST || 'localhost',
        database: process.env.MYSQL_DB_NAME,
        username: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD
    })
    //setUpAssociations();

module.exports = sequelize