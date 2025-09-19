/**
 * Revert visual theme changes made during localization QA fixes.
 * - product description back to collapsed "view more" layout
 * - header logo back to original {{ shop.name }} markup (remove jt_shop_name fallback)
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

assertRequired();

const THEME_ID = '196825383259';

const SHOP_NAME_BLOCK =
  "{% capture jt_shop_name %}{{ 'header.general.shop_name' | t }}{% endcapture %}{% if jt_shop_name == blank or jt_shop_name contains 'header.general' or jt_shop_name contains 'Translation missing' %}{% assign jt_shop_name_final = 'JT Products' %}{% else %}{% assign jt_shop_name_final = jt_shop_name %}{% endif %}{{ jt_shop_name_final }}";

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

function revertHeader(content) {
  let next = content;
  let changed = false;
  if (next.includes('jt_shop_name')) {
    next = next.split(SHOP_NAME_BLOCK).join('{{ shop.name }}');
    changed = true;
  }
  const altFrom = "alt=\"{{ 'header.general.shop_name' | t | escape }}\"";
  const altTo = 'alt="{{ section.settings.logo.alt | default: shop.name | escape }}"';
  if (next.includes(altFrom)) {
    next = next.split(altFrom).join(altTo);
    changed = true;
  }
  return { next, changed };
}

function revertProductJson(raw) {
  const j = JSON.parse(raw);
  const desc = j?.sections?.main?.blocks?.description;
  if (!desc) return { changed: false, raw };
  const before = desc.settings?.display_mode;
  if (before !== 'view_more') {
    desc.settings.display_mode = 'view_more';
    return { changed: true, raw: JSON.stringify(j, null, 2), before, after: 'view_more' };
  }
  return { changed: false, raw, before, after: before };
}

(async () => {
  await getMainTheme();
  const results = {};

  const header = await getAsset('sections/header.liquid');
  const headerFix = revertHeader(header);
  if (headerFix.changed) {
    await putAsset('sections/header.liquid', headerFix.next);
    results.header = { reverted: true, jt_shop_name_remaining: (headerFix.next.match(/jt_shop_name/g) || []).length };
  } else {
    results.header = { reverted: false, note: 'already_original' };
  }

  const productJson = await getAsset('templates/product.json');
  const productFix = revertProductJson(productJson);
  if (productFix.changed) {
    await putAsset('templates/product.json', productFix.raw);
    results.productJson = { reverted: true, display_mode: { before: productFix.before, after: productFix.after } };
  } else {
    results.productJson = { reverted: false, display_mode: productFix.before };
  }

  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
