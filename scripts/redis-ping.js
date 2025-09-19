require('dotenv').config();
const { config } = require('../src/config');
const { pingRedis } = require('../src/utils/redisConnection');

(async () => {
  const ok = await pingRedis();
  if (ok) {
    console.log(`Redis OK at ${config.redis.host}:${config.redis.port}`);
    process.exit(0);
  }
  console.error(`Redis not reachable at ${config.redis.host}:${config.redis.port}`);
  console.error('Start: docker compose up -d redis');
  process.exit(1);
})();
