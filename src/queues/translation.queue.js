const { Queue, QueueEvents } = require('bullmq');
const { config } = require('../config');
const { getRedisConnection } = require('../utils/redisConnection');
const { logger } = require('../utils/logger');

/** @type {import('bullmq').Queue | null} */
let translationQueue = null;
/** @type {import('bullmq').Queue | null} */
let dlq = null;
/** @type {import('bullmq').QueueEvents | null} */
let queueEvents = null;
/** @type {import('ioredis').default | null} */
let queueEventsConnection = null;

function getConnection() {
  return getRedisConnection();
}

function initQueues() {
  if (translationQueue) return { connection: getConnection(), translationQueue, dlq, queueEvents };

  const connection = getConnection();
  queueEventsConnection = connection.duplicate();

  translationQueue = new Queue(config.queue.name, {
    connection,
    defaultJobOptions: {
      attempts: config.queue.attempts,
      backoff: {
        type: 'exponential',
        delay: config.queue.backoffMs,
      },
      removeOnComplete: {
        age: 3600,
        count: 5000,
      },
      removeOnFail: {
        age: 86400 * 7,
      },
    },
  });

  dlq = new Queue(`${config.queue.name}-dlq`, { connection });

  queueEvents = new QueueEvents(config.queue.name, { connection: queueEventsConnection });

  queueEvents.on('failed', ({ jobId, failedReason, prev }) => {
    logger.error('queue_job_failed', { jobId, failedReason, prev });
  });

  return { connection, translationQueue, dlq, queueEvents };
}

function getTranslationQueue() {
  return initQueues().translationQueue;
}

function getDlq() {
  return initQueues().dlq;
}

function getQueueEvents() {
  return initQueues().queueEvents;
}

/**
 * Move exhausted failure to DLQ (best-effort duplicate of metadata).
 * @param {import('bullmq').Job} job
 * @param {string} errMessage
 */
async function pushToDlq(job, errMessage) {
  try {
    await getDlq().add(
      'failed-translation',
      {
        originalJobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: errMessage,
        finishedOn: Date.now(),
      },
      { removeOnComplete: false }
    );
  } catch (e) {
    logger.error('dlq_push_failed', { message: e.message });
  }
}

module.exports = {
  getConnection,
  pushToDlq,
  initQueues,
  getTranslationQueue,
  getDlq,
  getQueueEvents,
};
