/**
 * Fallback product.title when media.alt is blank (SEO/accessibility).
 * Usage: node scripts/patch-product-gallery-alt.js
 */
require('dotenv').config();
const axios = require('axios');
const { config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');
const { assertRequired } = require('../src/config');
const { logger } = require('../src/utils/logger');

const FALLBACK = `{%- if media_alt == blank -%}
                {%- assign media_alt = product.title -%}
              {%- endif -%}`;

const NEEDLE = '{%- assign media_alt = media.alt -%}';

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const themeId = theme.id.split('/').pop();
  const base = `${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const assetKey = 'snippets/product-gallery.liquid';

  const res = await axios.get(base, { headers, params: { 'asset[key]': assetKey } });
  let content = res.data?.asset?.value || '';
  if (!content.includes(NEEDLE)) {
    throw new Error('product-gallery.liquid: media_alt assignment not found');
  }
  if (content.includes('if media_alt == blank')) {
    console.log('Already patched');
    return;
  }

  let patched = 0;
  let searchFrom = 0;
  while (true) {
    const idx = content.indexOf(NEEDLE, searchFrom);
    if (idx === -1) break;
    const insertAt = idx + NEEDLE.length;
    content = content.slice(0, insertAt) + '\n\n              ' + FALLBACK + content.slice(insertAt);
    patched += 1;
    searchFrom = insertAt + FALLBACK.length + 20;
  }

  await axios.put(
    base,
    { asset: { key: assetKey, value: content } },
    { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 120000 }
  );
  logger.info('product_gallery_alt_patched', { patched });
  console.log({ patched });
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
