To implement a high-performance rate limiter for a ticketing system, you want to avoid "Check-then-Set" race conditions where two requests sneak through at the same millisecond.The most robust way to do this is using a Fixed Window algorithm executed via a Redis Lua Script. This ensures the "Is this user over the limit?" and "Increment their count" steps happen as a single, atomic operation.The "What & How" Guide for your AI1. The Strategy: Atomic Fixed WindowGoal: Limit a specific user (identified by IP or User ID) to $X$ requests per $Y$ seconds.Mechanism: Use a Redis key (e.g., rate_limit:127.0.0.1) that stores the count and has a Time-to-Live (TTL).The Edge Case: If two requests arrive at the exact same time, a standard Node.js implementation might let both through before the database updates. Lua solves this by locking the key for the microsecond it takes to run the logic.2. The Implementation StepsA. Define the Lua ScriptThe script needs to check if the key exists and is over the limit. If not, it increments. If it’s the first request (count is 1), it sets the expiration.Lua-- KEYS[1] is the rate limit key
-- ARGV[1] is the limit (e.g., 5)
-- ARGV[2] is the window in seconds (e.g., 60)

local current = redis.call('get', KEYS[1])

if current and tonumber(current) >= tonumber(ARGV[1]) then
return 0 -- Limit exceeded
end

current = redis.call('incr', KEYS[1])

if tonumber(current) == 1 then
redis.call('expire', KEYS[1], ARGV[2])
end

return 1 -- Request allowed
B. Create the Fastify Middleware (or Hook)Use preHandler to intercept requests to /reserve or /confirm.Identifier: Use request.ip or a userId from a JWT.Response: If the script returns 0, send a 429 Too Many Requests status.Headers: Professional APIs return X-RateLimit-Limit and X-RateLimit-Remaining headers.C. Redis IntegrationUse your existing Redis client (likely ioredis) to execute the script using the .eval() method.Prompt to feed your Coding AI"I am building a rate limiter for my Fastify API using Redis.Implement a preHandler hook (middleware) that identifies users by IP.Use a Redis Lua script to atomically increment a counter and check if it exceeds a limit of 10 requests per 60 seconds.If the limit is exceeded, return a 429 status with a JSON error message.Include headers in the response showing the current limit and remaining attempts.Ensure the script handles the TTL (expiration) correctly on the first increment."
