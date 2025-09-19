require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const id = '196825383259';
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': 'templates/product.json' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const j = JSON.parse(res.data.asset.value);
  const order = j.order || Object.keys(j.sections || {});
  console.log('order:', order);
  const types = {};
  for (const [id, sec] of Object.entries(j.sections || {})) {
    const t = sec.type;
    types[t] = (types[t] || 0) + 1;
    if (/product|main|buy/i.test(t) || t === 'main-product') {
      console.log(id, t);
    }
  }
  console.log('type counts:', types);
})();
