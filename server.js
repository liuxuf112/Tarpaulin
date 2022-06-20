const express = require('express')
const morgan = require('morgan')

const api = require('./api')
const { redisClient, rateLimit } = require('./lib/redis')

const sequelize = require('./lib/sequelize')

const app = express()
const port = process.env.PORT || 8000



/*
 * Morgan is a popular logger.
 */
app.use(morgan('dev'))

app.use(express.json())
app.use(express.static('public'))

app.use(rateLimit);
/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.js.  That's what we include here, and
 * it provides all of the routes.
 */
app.use('/', api)

app.use('*', function(req, res, next) {
    res.status(404).json({
        error: "Requested resource " + req.originalUrl + " does not exist"
    })
})

/*
 * This route will catch any errors thrown from our API endpoints and return
 * a response with a 500 status to the client.
 */
app.use('*', function(err, req, res, next) {
    console.error("== Error:", err)
    res.status(500).send({
        error: "Server error.  Please try again later."
    })
})
redisClient.connect().then(function() {
    sequelize.sync().then(function() {
        app.listen(port, function() {
            console.log("== Server is listening on port:", port)
        })
    })
})