/**
 * Probe live MAIN theme for localization patches.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme, graphql } = require('../src/services/shopify.service');

const KEYS = [
  'sections/header.liquid',
  'templates/product.json',
  'snippets/product-price.liquid',
  'snippets/product-meta.liquid',
  'snippets/dynamic-shipping-calculator.liquid',
  'snippets/jt-locale-string.liquid',
  'sections/footer.liquid',
  'sections/three-column-contact.liquid',
  'sections/main-product.liquid',
];

const MARKERS = [
  'jt_shop_name',
  'jt-locale-string',
  'jt.product.trust_tuners',
  "header.general.cart",
  'display_mode',
];

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  console.log('MAIN theme', theme.id, theme.name, theme.role);

  const themes = await graphql(`{ themes(first: 20) { edges { node { id name role } } } }`);
  console.log('\nAll themes:');
  for (const { node } of themes.themes.edges) {
    console.log(`  ${node.role || '-'} | ${node.id.split('/').pop()} | ${node.name}`);
  }

  const base = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };

  console.log('\nLocalization markers on MAIN theme:');
  for (const key of KEYS) {
    try {
      const res = await axios.get(base, { headers, params: { 'asset[key]': key } });
      const v = res.data?.asset?.value || '';
      const hits = MARKERS.filter((m) => v.includes(m));
      console.log(key, v ? `OK (${v.length} chars)` : 'MISSING', hits.length ? `→ ${hits.join(', ')}` : '');
      if (key === 'templates/product.json' && v) {
        const j = JSON.parse(v);
        console.log('  description display_mode:', j?.sections?.main?.blocks?.description?.settings?.display_mode);
        console.log('  main blocks:', Object.keys(j?.sections?.main?.blocks || {}).length);
      }
    } catch (e) {
      console.log(key, 'ERROR', e.response?.status || e.message);
    }
  }
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
