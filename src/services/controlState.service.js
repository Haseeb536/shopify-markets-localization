const { getRedisConnection, redisOpts } = require('../utils/redisConnection');
const { logger } = require('../utils/logger');

const KEY = 'localization:control';

function getRedis() {
  return getRedisConnection();
}

/**
 * @returns {Promise<{ workersDisabled: boolean, webhooksDisabled: boolean }>}
 */
async function getControlFlags() {
  try {
    const r = getRedis();
    const raw = await r.get(KEY);
    if (!raw) {
      return {
        workersDisabled: config.control.workersDisabled,
        webhooksDisabled: config.control.webhooksDisabled,
      };
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        workersDisabled: Boolean(parsed.workersDisabled),
        webhooksDisabled: Boolean(parsed.webhooksDisabled),
      };
    } catch {
      return {
        workersDisabled: config.control.workersDisabled,
        webhooksDisabled: config.control.webhooksDisabled,
      };
    }
  } catch (e) {
    logger.warn('control_flags_redis_unavailable', { message: e.message });
    return {
      workersDisabled: config.control.workersDisabled,
      webhooksDisabled: config.control.webhooksDisabled,
    };
  }
}

/**
 * @param {Partial<{ workersDisabled: boolean, webhooksDisabled: boolean }>} patch
 */
async function setControlFlags(patch) {
  try {
    const current = await getControlFlags();
    const next = { ...current, ...patch };
    const r = getRedis();
    await r.set(KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    logger.error('control_flags_set_failed', { message: e.message });
    throw e;
  }
}

async function resetControlFlags() {
  try {
    const r = getRedis();
    await r.del(KEY);
  } catch (e) {
    logger.error('control_flags_reset_failed', { message: e.message });
    throw e;
  }
}

module.exports = {
  getRedis,
  redisOpts,
  getControlFlags,
  setControlFlags,
  resetControlFlags,
};
