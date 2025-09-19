const crypto = require('crypto');
const { config, assertWebhookSecret } = require('../config');

/**
 * @param {Buffer|string} rawBody
 * @param {string|undefined} hmacHeader
 * @param {string} secret
 */
function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const a = Buffer.from(hash, 'utf8');
  const b = Buffer.from(String(hmacHeader), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireWebhookSecret() {
  assertWebhookSecret();
  return config.shopify.apiSecret;
}

module.exports = { verifyShopifyWebhook, requireWebhookSecret };
