/**
 * Translate a single product to all published TARGET_LOCALES (no queue).
 * Usage: node scripts/translate-one-product.js <productId>
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { translateResource } = require('../src/services/translation.service');
const { Gid } = require('../src/services/shopify.service');

const productId = process.argv[2];
if (!productId) {
  console.error('Usage: node scripts/translate-one-product.js <productId>');
  process.exit(1);
}

(async () => {
  assertRequired();
  const gid = Gid.product(productId);
  console.log('Translating', gid, '→', config.locales.targets.join(', '));
  const result = await translateResource(gid, { topic: 'translate-one-product' });
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
