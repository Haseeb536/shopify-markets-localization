require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
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
  fs.writeFileSync('data/product-gallery.liquid', res.data.asset.value);
  const c = res.data.asset.value;
  console.log(c.split('\n').slice(15, 45).join('\n'));
})();
