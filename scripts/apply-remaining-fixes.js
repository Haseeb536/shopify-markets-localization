/**
 * Apply all remaining open QA fixes.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { getMainTheme, graphql, fetchTranslatableResource, registerTranslationsReliable } = require('../src/services/shopify.service');
const { putThemeLocaleAsset } = require('../src/services/themeLocale.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { fixThemeProductStrings, THEME_STRING_FIXES } = require('../src/services/fixThemeProductStrings.service');
const { applyThemeStorefrontNav } = require('../src/services/themeStorefrontNav.service');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const THEME_ID = '196825383259';

async function getThemeAsset(key) {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 60000,
  });
  return res.data?.asset?.value || '';
}

async function putThemeAsset(key, value) {
  await axios.put(
    `${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`,
    { asset: { key, value } },
    {
      headers: {
        'X-Shopify-Access-Token': config.shopify.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );
}

async function fixShopNameLocaleKeys() {
  const theme = await getMainTheme();
  const locales = ['fr', 'it'];
  const results = [];
  for (const loc of locales) {
    const put = await putThemeLocaleAsset(theme.id, `locales/${loc}.json`, {
      'header.general.shop_name': 'JT Products',
    });
    results.push({ loc, ...put });
  }
  return results;
}

async function fixTuningStringsForce() {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const key = Object.keys(THEME_STRING_FIXES)[0];
  const row = (tr.translatableContent || []).find((c) => c.key === key && c.digest);
  if (!row) return { error: 'key_not_found', key };

  const fixes = THEME_STRING_FIXES[key];
  const batch = Object.entries(fixes).map(([locale, value]) => ({
    locale,
    key,
    value,
    translatableContentDigest: row.digest,
  }));
  await registerTranslationsReliable(theme.id, batch, { batchSize: 5 });

  const verify = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id: theme.id, l: 'es' }
  );
  const esVal = verify.translatableResource.translations.find((t) => t.key === key)?.value;
  return { registered: batch.length, esValue: esVal };
}

async function fixDuplicateProductBlocks() {
  const raw = await getThemeAsset('templates/product.json');
  const j = JSON.parse(raw);
  const main = j.sections?.main;
  if (!main?.blocks) return { skipped: true, reason: 'no_main_blocks' };

  const blocks = main.blocks;
  const order = main.block_order || [];
  const seen = new Map();
  const remove = [];

  for (const bid of order) {
    const b = blocks[bid];
    if (!b) continue;
    const sig = `${b.type}:${JSON.stringify(b.settings || {})}`;
    if (['product_meta', 'price_Xq9hGU', 'variant_selector', 'buy_buttons'].includes(bid)) {
      if (seen.has(b.type)) remove.push(bid);
      else seen.set(b.type, bid);
    }
  }

  // Do not remove return/applicability accordions — titles can look duplicate but only one
  // block (content_NXhqmi) carries the return-policy HTML; content_qVRxey is title-only shell.

  const uniqueRemove = [...new Set(remove)];
  if (!uniqueRemove.length) {
    return { removed: 0, note: 'no_duplicate_blocks_in_json' };
  }

  for (const bid of uniqueRemove) delete blocks[bid];
  main.block_order = order.filter((bid) => !uniqueRemove.includes(bid));

  await putThemeAsset('templates/product.json', JSON.stringify(j, null, 2));
  return { removed: uniqueRemove.length, ids: uniqueRemove };
}

async function patchMainProductLiquid() {
  const key = 'sections/main-product.liquid';
  const content = await getThemeAsset(key);
  if (!content) return { patched: false, note: 'asset_missing' };

  const mainRenders = (content.match(/\{%-?\s*render\s+['"]product-info/g) || []).length;
  const quickBuyOnly = content.includes('product-quick-view') && mainRenders === 2;
  return {
    patched: false,
    note: 'quick_buy_second_render_is_intentional',
    productInfoRenders: mainRenders,
    quickBuyOnly,
  };
}

(async () => {
  assertRequired();
  clearGlossaryCaches();

  // Override motorsport tuning -> keep "tuning" in ES (glossary custom wins)
  const glossaryPath = require('path').join(process.cwd(), 'config', 'glossary.json');
  const glossary = require(glossaryPath);
  if (!glossary.tuning) {
    glossary.tuning = { DE: 'Tuning', FR: 'tuning', EN: 'tuning', IT: 'tuning', ES: 'tuning', PL: 'tuning' };
    glossary.Tuning = { DE: 'Tuning', FR: 'tuning', EN: 'tuning', IT: 'tuning', ES: 'tuning', PL: 'tuning' };
    require('fs').writeFileSync(glossaryPath, JSON.stringify(glossary, null, 2) + '\n');
  }

  const shopName = await fixShopNameLocaleKeys();
  const themeNav = await applyThemeStorefrontNav();
  const tuning = await fixTuningStringsForce();
  const bodies = await repairPublishedProductBodies([FLAGSHIP]);
  const productJson = await fixDuplicateProductBlocks();
  const liquid = await patchMainProductLiquid();

  console.log(JSON.stringify({ shopName, themeNav: { localeKeys: themeNav.localeKeys }, tuning, bodies, productJson, liquid }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
