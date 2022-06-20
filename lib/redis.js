const redis = require('redis');
const { secretKey } = require('../api/authorization');
const jwt = require('jsonwebtoken');
const rateLimitWindowMilliseconds = 60000;
const rateLimitWindowMaxRequestsNonAuth = 10;
const rateLimitWindowMaxRequestsAuth = 30;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT || '6379';
const redisClient = redis.createClient({
    url: `redis://${redisHost}:${redisPort}`
});

//literally copy pasted from the notes.
async function rateLimit(req, res, next) {
    //first we check if there's a user. 
    const authHeader = req.get('Authorization') || '';
    const authHeaderParts = authHeader.split(' ');

    const token = authHeaderParts[0] === 'Bearer' ?
        authHeaderParts[1] : null;
    let user = undefined;
    if (token) {
        try {

            const payload = jwt.verify(token, secretKey);
            user = payload.sub;

        } catch (err) {
            console.error(err);
            res.status(401).json({
                error: "Invalid authentication token provided."
            });
            return;

        }
    }
    let identifier;
    let limit;
    if (user) {
        identifier = String(user);
        limit = rateLimitWindowMaxRequestsAuth;
    } else {
        identifier = String(req.ip);
        limit = rateLimitWindowMaxRequestsNonAuth;
    }


    let tokenBucket;
    try {
        tokenBucket = await redisClient.hGetAll(identifier)
    } catch (err) { //if there's an error with redis then continue
        console.log(`Redis Error: ${err}`)
        next();
        return;
    }
    tokenBucket = {
            tokens: parseFloat(tokenBucket.tokens) ||
                limit,
            last: parseInt(tokenBucket.last) || Date.now()
        }
        //leave this log in for hess to see that tokens are working.
    console.log(`bucket:`, tokenBucket);
    const timestamp = Date.now();
    const elapsedMilliseconds = timestamp - tokenBucket.last;
    const refreshRate =
        limit / rateLimitWindowMilliseconds;
    tokenBucket.tokens += elapsedMilliseconds * refreshRate;

    tokenBucket.tokens =
        Math.min(limit, tokenBucket.tokens);
    tokenBucket.last = timestamp;
    if (tokenBucket.tokens >= 1) {
        tokenBucket.tokens -= 1;
        await redisClient.hSet(identifier, [
            ['tokens', tokenBucket.tokens],
            ['last', tokenBucket.last]
        ])
        next();
    } else {
        await redisClient.hSet(identifier, [
            ['tokens', tokenBucket.tokens],
            ['last', tokenBucket.last]
        ])
        res.status(429).json({
            error: "Too many requests per minute"
        });
        return;
    }






}


module.exports = { redisClient, rateLimit };