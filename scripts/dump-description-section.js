require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
    params: { 'asset[key]': 'sections/main-product.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const c = res.data.asset.value;
  const idx = c.indexOf("{%- when 'description' -%}");
  fs.writeFileSync('data/main-product-description.liquid', c.slice(idx, idx + 6000));
  console.log('written from', idx);
  const vm = (c.match(/display_mode == 'view_more'/g) || []).length;
  const exp = (c.match(/expandable-content/g) || []).length;
  console.log('view_more checks:', vm, 'expandable-content:', exp);
})();
