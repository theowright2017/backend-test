import { redis } from "@/shared/redis";
import { FastifyReply, FastifyRequest } from "fastify";

const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

const LUA_SCRIPT_STRING = `-- KEYS[1] is the rate limit key
-- ARGV[1] is the limit (e.g., 10)
-- ARGV[2] is the window in seconds (e.g., 60)

local current = redis.call('get', KEYS[1])

if current and tonumber(current) >= tonumber(ARGV[1]) then
  return 0 -- Limit exceeded
end

current = redis.call('incr', KEYS[1])

if tonumber(current) == 1 then
  redis.call('expire', KEYS[1], ARGV[2])
end

return 1 -- Request allowed`;

export async function rateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identifier = request.ip;
  const key = `rate_limit:ip:${identifier}`;

  // Call Lua script atomically
  const result = await redis.eval(
    LUA_SCRIPT_STRING, // the string from above
    1, // number of keys
    key,
    RATE_LIMIT.toString(),
    WINDOW_SECONDS.toString(),
  );

  const allowed = Number(result) === 1;

  if (allowed) {
    return; // let Fastify continue
  }

  reply
    .code(429)
    .headers({
      "X-RateLimit-Limit": RATE_LIMIT.toString(),
      "X-RateLimit-Remaining": "0", // simple version
    })
    .send({ error: "Too many requests" });
}
