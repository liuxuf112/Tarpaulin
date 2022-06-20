const { Router } = require('express')
const { requireAuthentication } = require('./authorization')
const router = Router()
const path = require('path');
const fs = require('fs');



//gets a submission file. No authentication because the file is random.
//Finding the file name would be very difficult. Basically like brute forcing a pasword.
router.get('/:filename', async function(req, res, next) {
    const fileLocation = path.join(__dirname, '/submissions', req.params.filename);
    console.log(fileLocation);
    if (fs.existsSync(fileLocation)) {
        res.status(200).sendFile(fileLocation);
    } else {
        next();
    }
})







module.exports = router