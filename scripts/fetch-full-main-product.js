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
  fs.writeFileSync('data/main-product-full.liquid', res.data.asset.value);
  const c = res.data.asset.value;
  const patterns = ['expandable-content', 'view_more', 'product-block-list__item--content', 'display_mode', 'disabled'];
  for (const p of patterns) {
    console.log(p, (c.match(new RegExp(p, 'g')) || []).length);
  }
})();
