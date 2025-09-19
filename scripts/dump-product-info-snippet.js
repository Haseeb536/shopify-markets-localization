require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
    params: { 'asset[key]': 'snippets/product-info.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const c = res.data.asset.value;
  fs.writeFileSync(path.join(process.cwd(), 'tmp-product-info.liquid'), c);
  console.log('written', c.length);
})();
