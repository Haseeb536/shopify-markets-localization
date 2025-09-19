require('dotenv').config();

const { Worker } = require('bullmq');
const { config, assertRequired } = require('../config');
const { requireRedis } = require('../utils/redisConnection');
const {
  getConnection,
  getQueueEvents,
  getTranslationQueue,
  pushToDlq,
  initQueues,
} = require('../queues/translation.queue');
const { translateResource } = require('../services/translation.service');
const { translateThemeLocaleAssets } = require('../services/themeLocaleTranslate.service');
const { getControlFlags } = require('../services/controlState.service');
const {
  logTranslationRequest,
  logTranslationSuccess,
  logTranslationFailure,
  logRetry,
} = require('../utils/logger');

assertRequired();

/** @type {import('bullmq').Worker | null} */
let worker = null;

async function start() {
  await requireRedis();
  initQueues();
  const connection = getConnection();
  const queueEvents = getQueueEvents();

  worker = new Worker(
    config.queue.name,
    async (job) => {
      const flags = await getControlFlags();
      if (flags.workersDisabled) {
        return { skipped: true, reason: 'workers_disabled' };
      }

      const name = job.name;
      const data = job.data || {};

      if (name === 'theme-locale') {
        logTranslationRequest({ jobId: job.id, name, ...data });
        const result = await translateThemeLocaleAssets(
          data.themeGid,
          data.sourceAssetKey,
          data.assetKeyByLocale
        );
        logTranslationSuccess({ jobId: job.id, name, result });
        return result;
      }

      const resourceGid = data.resourceGid;
      if (!resourceGid) {
        throw new Error('Missing resourceGid');
      }

      logTranslationRequest({ jobId: job.id, name, resourceGid, topic: data.topic });
      const result = await translateResource(resourceGid, {
        jobId: job.id,
        name,
        topic: data.topic,
      });
      logTranslationSuccess({ jobId: job.id, name, resourceGid, result });
      return result;
    },
    {
      connection,
      concurrency: config.queue.concurrency,
    }
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      logRetry({
        jobId: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        attempts,
        error: err.message,
      });
    } else {
      logTranslationFailure({
        jobId: job.id,
        name: job.name,
        resourceGid: job.data?.resourceGid,
        error: err.message,
      });
      void pushToDlq(job, err.message);
    }
  });

  async function shutdown() {
    if (worker) await worker.close();
    await queueEvents.close();
    await getTranslationQueue().close();
    try {
      await connection.quit();
    } catch {
      /* ignore */
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // eslint-disable-next-line no-console
  console.log(`Translation worker started (concurrency=${config.queue.concurrency})`);
}

start().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
