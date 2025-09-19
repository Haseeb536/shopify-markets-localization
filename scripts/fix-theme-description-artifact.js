/**
 * Remove malformed `<!-- > ... -->` comment from main-product description block.
 * That line renders as visible "-->" before product descriptions on the storefront.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

const ASSET_KEY = 'sections/main-product.liquid';
const BAD_LINE =
  /[ \t]*<!--\s*>\s*\{% assign desc = product\.description %\}[\s\S]*?<p>\{\{ desc \}\}<\/p>\s*-->\s*\n?/g;

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const themeId = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': ASSET_KEY },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const before = res.data?.asset?.value || '';
  if (!BAD_LINE.test(before)) {
    console.log('No malformed description comment found — already clean.');
    return;
  }
  BAD_LINE.lastIndex = 0;
  const after = before.replace(BAD_LINE, '');
  const put = await axios.put(
    `${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`,
    { asset: { key: ASSET_KEY, value: after } },
    { headers: { 'X-Shopify-Access-Token': config.shopify.accessToken } }
  );
  const errs = put.data?.errors;
  if (errs) {
    console.error('Theme update failed:', errs);
    process.exit(1);
  }
  const removed = (before.match(BAD_LINE) || []).length;
  console.log(`Patched ${ASSET_KEY}: removed ${removed} malformed comment block(s).`);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
