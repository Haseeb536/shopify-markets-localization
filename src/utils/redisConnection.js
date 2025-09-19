const Redis = require('ioredis');
const { config } = require('../config');
const { logger } = require('./logger');

/** @type {Redis | null} */
let sharedClient = null;
let errorLogged = false;

function redisOpts(overrides = {}) {
  const noRedis = process.env.LOCALIZATION_NO_REDIS === '1';
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    tls: config.redis.tls,
    retryStrategy(times) {
      if (noRedis) return null;
      if (times > 8) return null;
      return Math.min(times * 300, 3000);
    },
    ...overrides,
  };
}

function attachErrorHandler(client) {
  client.on('error', (err) => {
    if (errorLogged) return;
    errorLogged = true;
    logger.warn('redis_connection_error', {
      message: err.message,
      host: config.redis.host,
      port: config.redis.port,
      hint: 'Start Redis: docker compose up -d redis  OR  use direct scripts (no worker): npm run fix:pipeline-v2',
    });
  });
  client.on('connect', () => {
    errorLogged = false;
  });
}

/**
 * Shared Redis client (lazy). BullMQ uses duplicates via duplicate().
 * @returns {Redis}
 */
function getRedisConnection() {
  if (process.env.LOCALIZATION_NO_REDIS === '1') {
    throw new Error(
      'Redis is disabled (LOCALIZATION_NO_REDIS=1). Use npm run translate:store:no-redis or fix:pipeline-v2.'
    );
  }
  if (!sharedClient) {
    sharedClient = new Redis(redisOpts());
    attachErrorHandler(sharedClient);
  }
  return sharedClient;
}

/**
 * @returns {Promise<boolean>}
 */
async function pingRedis() {
  const client = new Redis({
    ...redisOpts(),
    lazyConnect: true,
    retryStrategy: () => null,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * @returns {Promise<void>}
 */
async function requireRedis() {
  const ok = await pingRedis();
  if (ok) return;
  const msg = [
    'Redis is not running at',
    `${config.redis.host}:${config.redis.port}.`,
    '',
    'Start it:',
    '  docker compose up -d redis',
    '',
    'Or run translation without a queue (no worker needed):',
    '  npm run fix:pipeline-v2 -- <productId>',
    '  npm run translate:product:full -- <productId>',
    '  npm run translate:store -- --sync-only',
  ].join('\n');
  throw new Error(msg);
}

module.exports = {
  redisOpts,
  getRedisConnection,
  pingRedis,
  requireRedis,
};
