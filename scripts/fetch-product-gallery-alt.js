require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': 'snippets/product-gallery.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const c = res.data.asset.value;
  const lines = c.split('\n');
  lines.forEach((line, i) => {
    if (/alt/i.test(line)) console.log(i + 1, line.trim());
  });
})();
