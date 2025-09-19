require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
    params: { 'asset[key]': 'sections/header.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  fs.writeFileSync('data/header-live.liquid', res.data.asset.value);
  console.log('written', res.data.asset.value.length);
})();
