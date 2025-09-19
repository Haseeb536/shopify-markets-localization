/**
 * Restore product description "Bekijk meer" / view more behavior.
 * Custom theme.css was hiding the toggle and forcing full height on description.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

assertRequired();

const THEME_ID = '196825383259';
const CSS_KEY = 'assets/theme.css';

const KILL_LOAD_MORE_CSS = `.product-block-list__item--description .expandable-content[aria-expanded] {
  max-height: none !important;
  overflow: visible !important;
}
.product-block-list__item--description .expandable-content .expandable-content__toggle {
  display: none !important;
}

`;

async function getAsset(key) {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  return res.data?.asset?.value || '';
}

async function putAsset(key, value) {
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

function fixThemeCss(css) {
  if (!css.includes('product-block-list__item--description .expandable-content')) {
    return { changed: false, css, note: 'override_not_found' };
  }
  const next = css.split(KILL_LOAD_MORE_CSS).join('');
  return { changed: next !== css, css: next };
}

function fixProductJson(raw) {
  const j = JSON.parse(raw);
  const desc = j?.sections?.main?.blocks?.description;
  if (!desc) return { changed: false, raw };
  const before = desc.settings?.display_mode;
  if (before === 'view_more') return { changed: false, raw, display_mode: before };
  desc.settings.display_mode = 'view_more';
  return { changed: true, raw: JSON.stringify(j, null, 2), display_mode: { before, after: 'view_more' } };
}

(async () => {
  await getMainTheme();
  const results = {};

  const css = await getAsset(CSS_KEY);
  const cssFix = fixThemeCss(css);
  if (cssFix.changed) {
    await putAsset(CSS_KEY, cssFix.css);
    results.themeCss = { reverted: true, killRulesRemoved: true };
  } else {
    results.themeCss = { reverted: false, note: cssFix.note };
  }

  const productJson = await getAsset('templates/product.json');
  const productFix = fixProductJson(productJson);
  if (productFix.changed) {
    await putAsset('templates/product.json', productFix.raw);
    results.productJson = { display_mode: productFix.display_mode };
  } else {
    results.productJson = { display_mode: productFix.display_mode || 'view_more' };
  }

  const verifyCss = await getAsset(CSS_KEY);
  results.verify = {
    cssOverrideGone: !verifyCss.includes('product-block-list__item--description .expandable-content .expandable-content__toggle'),
    baseExpandableMaxHeight: verifyCss.includes('.expandable-content[aria-expanded] {\n  max-height: 320px'),
  };

  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
