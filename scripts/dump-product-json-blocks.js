require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
    params: { 'asset[key]': 'templates/product.json' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const j = JSON.parse(res.data.asset.value);
  const main = j.sections.main;
  console.log('block_order:', main.block_order);
  for (const bid of main.block_order) {
    const b = main.blocks[bid];
    const title = b.settings?.title || '';
    const content = (b.settings?.content || '').slice(0, 60);
    console.log(bid, b.type, title || content || JSON.stringify(b.settings || {}).slice(0, 80));
  }
})();
