/**
 * Check that a product and theme have translations for a locale (e.g. it).
 * Usage: node scripts/verify-store-locale.js it [productId]
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { graphql, Gid, getMainTheme } = require('../src/services/shopify.service');
const {
  fetchThemeLocaleAsset,
  resolveThemeLocaleAssetKey,
  listThemeLocaleAssetKeys,
} = require('../src/services/themeLocale.service');

const locale = (process.argv[2] || 'it').toLowerCase().split('-')[0];
const productId = process.argv[3] || '10360907989339';

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const keys = await listThemeLocaleAssetKeys(theme.id);
  const assetKey = resolveThemeLocaleAssetKey(locale, keys);
  const themeJson = await fetchThemeLocaleAsset(theme.id, assetKey);

  const jtProduct = themeJson?.jt?.product || {};
  const jtContact = themeJson?.jt?.contact || {};
  console.log('Theme asset:', assetKey);
  console.log('jt.product keys:', Object.keys(jtProduct).length ? jtProduct : '(missing — run translate:theme-ui)');
  console.log('jt.contact keys:', Object.keys(jtContact).length ? jtContact : '(missing)');

  const data = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value }
      }
    }`,
    { id: Gid.product(productId), locale }
  );
  const rows = data.translatableResource?.translations || [];
  const title = rows.find((r) => r.key === 'title')?.value || '';
  const body = rows.find((r) => r.key === 'body_html')?.value || '';
  console.log('\nProduct', productId, 'locale', locale);
  console.log('title:', title.slice(0, 120));
  console.log('body_html length:', body.length);
  if (!body.length) {
    console.log('FAIL: no body_html translation — run worker + product job for this locale.');
    process.exit(1);
  }
  const dutchHints = /\b(voor de|zonder aanpassingen|Veelgestelde vragen|Inhoud van de set)\b/i;
  if (dutchHints.test(body)) {
    console.log('WARN: body still contains Dutch phrases — re-translate product or check Markets URL.');
    process.exit(2);
  }
  console.log('OK: product has translated body for', locale);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
