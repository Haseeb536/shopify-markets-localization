require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

const MAIN = '198196232522';
const BACKUPS = {
  march: '196824990026',
  dabeerLive: '202039656778',
};

const KEYS = [
  'snippets/product-price.liquid',
  'snippets/product-meta.liquid',
  'snippets/dynamic-shipping-calculator.liquid',
  'sections/header.liquid',
  'templates/product.json',
];

async function getAsset(themeId, key) {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  return res.data?.asset?.value || '';
}

(async () => {
  for (const key of KEYS) {
    console.log('\n===', key);
    const main = await getAsset(MAIN, key);
    for (const [name, id] of Object.entries(BACKUPS)) {
      const bak = await getAsset(id, key);
      const same = main === bak;
      const jtMain = (main.match(/jt-locale-string|jt\.product\.trust_tuners|jt_shop_name/g) || []).length;
      const jtBak = (bak.match(/jt-locale-string|jt\.product\.trust_tuners|jt_shop_name/g) || []).length;
      console.log(`  ${name}: identical=${same} markers main=${jtMain} backup=${jtBak}`);
    }
  }
})().catch((e) => console.error(e.response?.data || e.message));
