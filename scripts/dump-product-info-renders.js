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
  const re = /render\s+['"]product-info[^'"]*['"][^%]*/gi;
  let m;
  let i = 0;
  while ((m = re.exec(c))) {
    i++;
    const start = Math.max(0, m.index - 300);
    const end = Math.min(c.length, m.index + 400);
    console.log('\n=== render', i, 'at', m.index, '===');
    console.log(c.slice(start, end));
  }
})();
