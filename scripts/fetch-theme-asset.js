require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const axios = require('axios');
const { getMainTheme } = require('../src/services/shopify.service');

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/fetch-theme-asset.js <asset-key>');
  process.exit(1);
}

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const v = res.data?.asset?.value || '';
  console.log(v.slice(0, 8000));
})();
