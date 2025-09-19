require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
    params: { 'asset[key]': 'sections/main-product.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const c = res.data.asset.value;
  const idx = c.indexOf('{%- for block in section.blocks -%}');
  console.log(c.slice(idx, idx + 3500));
})();
