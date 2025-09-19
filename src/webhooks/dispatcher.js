const { enqueueTranslation } = require('../queues/enqueue');
const { Gid } = require('../services/shopify.service');
const { logWebhook } = require('../utils/logger');
const { getControlFlags } = require('../services/controlState.service');

/**
 * @param {string} topic lower case topic e.g. products/create
 * @param {Buffer} rawBody
 * @param {Record<string, unknown>} payload
 */
async function handleShopifyWebhook(topic, rawBody, payload) {
  const flags = await getControlFlags();
  if (flags.webhooksDisabled) {
    logWebhook(topic, { status: 'ignored_webhooks_disabled', bytes: rawBody.length });
    return { queued: false, reason: 'webhooks_disabled' };
  }

  if (!payload?.id) {
    logWebhook(topic, { status: 'missing_id' });
    return { queued: false, reason: 'missing_id' };
  }

  let resourceGid = null;
  let jobName = '';

  switch (topic) {
    case 'products/create':
    case 'products/update':
      resourceGid = Gid.product(payload.id);
      jobName = 'product';
      break;
    case 'collections/create':
    case 'collections/update':
      resourceGid = Gid.collection(payload.id);
      jobName = 'collection';
      break;
    case 'pages/create':
    case 'pages/update':
      resourceGid = Gid.page(payload.id);
      jobName = 'page';
      break;
    case 'blogs/create':
    case 'blogs/update':
      resourceGid = Gid.blog(payload.id);
      jobName = 'blog';
      break;
    case 'articles/create':
    case 'articles/update':
      resourceGid = Gid.article(payload.id);
      jobName = 'article';
      break;
    default:
      return { queued: false, reason: 'unknown_topic' };
  }

  await enqueueTranslation(
    jobName,
    {
      resourceGid,
      topic,
      resourceNumericId: payload.id,
    },
    {
      jobId: `${topic}-${payload.id}-${payload.updated_at || Date.now()}`,
    }
  );

  logWebhook(topic, { resourceGid, resourceId: payload.id, queued: true });
  return { queued: true, resourceGid };
}

module.exports = { handleShopifyWebhook };
