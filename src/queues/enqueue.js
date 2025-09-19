const { getTranslationQueue } = require('./translation.queue');

/**
 * @param {string} name
 * @param {Record<string, unknown>} data
 * @param {import('bullmq').JobsOptions} [opts]
 */
async function enqueueTranslation(name, data, opts = {}) {
  await getTranslationQueue().add(name, data, {
    ...opts,
  });
}

module.exports = { enqueueTranslation };
