/**
 * Bring DE, EN, ES, FR, IT product page to full OK (product + theme + jt + IT fallback).
 * Usage: node scripts/complete-product-page-locales.js [productId]
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { translateProductComplete } = require('../src/services/translateProductComplete.service');
const { deployJtLocaleFallback } = require('../src/services/jtLocaleFallback.service');
const { Gid } = require('../src/services/shopify.service');

const productId = process.argv[2] || '10360905269595';

(async () => {
  assertRequired();
  console.log('Completing product page locales for', productId, '\n');

  const result = await translateProductComplete(Gid.product(productId), {
    withRelated: false,
  });
  console.log('Product locales:', result.product?.results?.map((r) => r.locale).join(', '));
  console.log('Theme template keys:', result.productTemplateTheme?.keys);

  const jtFb = await deployJtLocaleFallback(result.themeGid);
  console.log('JT fallback:', jtFb);

  console.log('\nRun: npm run audit:product-page:all --', productId);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
