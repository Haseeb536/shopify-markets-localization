const { verifyShopifyWebhook, requireWebhookSecret } = require('../webhooks/verify');
const { handleShopifyWebhook } = require('../webhooks/dispatcher');
const { logWebhook } = require('../utils/logger');

/**
 * Express middleware stack: raw body parser should run before this.
 */
async function shopifyWebhookController(req, res) {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const topic = (req.get('X-Shopify-Topic') || '').toLowerCase();
    const secret = requireWebhookSecret();
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).send('Expected raw body');
    }
    if (!verifyShopifyWebhook(raw, hmac, secret)) {
      logWebhook(topic || 'unknown', { status: 'invalid_hmac' });
      return res.status(401).send('Invalid HMAC');
    }
    let payload = {};
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    const result = await handleShopifyWebhook(topic, raw, payload);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { shopifyWebhookController };
