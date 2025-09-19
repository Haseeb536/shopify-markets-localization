require('dotenv').config();

const { assertRequired } = require('../src/config');
const { enqueueTranslation } = require('../src/queues/enqueue');
const { translationQueue } = require('../src/queues/translation.queue');

/**
 * @param {string} jobBaseName
 * @param {string[]} gids
 * @param {string} topicPrefix
 */
async function enqueueGids(jobBaseName, gids, topicPrefix) {
  assertRequired();
  let n = 0;
  for (const gid of gids) {
    const numeric = String(gid).split('/').pop();
    const jobId = `${topicPrefix}-${jobBaseName}-${numeric}`;
    await enqueueTranslation(jobBaseName, { resourceGid: gid, topic: topicPrefix }, { jobId });
    n += 1;
    if (n % 500 === 0) {
      // eslint-disable-next-line no-console
      console.log(`Enqueued ${n} jobs...`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Done. Enqueued ${n} jobs.`);
  await translationQueue.close();
}

module.exports = { enqueueGids };
