const { getTranslationQueue } = require('./translation.queue');
const { logger } = require('../utils/logger');

async function pauseTranslationQueue() {
  await getTranslationQueue().pause();
  logger.warn('translation_queue_paused');
}

async function resumeTranslationQueue() {
  await getTranslationQueue().resume();
  logger.info('translation_queue_resumed');
}

async function isQueuePaused() {
  const paused = await getTranslationQueue().isPaused();
  return paused;
}

module.exports = {
  pauseTranslationQueue,
  resumeTranslationQueue,
  isQueuePaused,
};
