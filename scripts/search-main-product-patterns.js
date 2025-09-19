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
  const patterns = [
    "when 'product_meta'",
    "when 'price'",
    "when 'buy_buttons'",
    'product.description',
    'innerHTML',
    'cloneNode',
    'product-form',
    'liquid_VtA97r',
    'thisnow',
  ];
  for (const p of patterns) {
    let pos = 0;
    const hits = [];
    while ((pos = c.indexOf(p, pos)) >= 0) {
      hits.push(pos);
      pos += 1;
    }
    if (hits.length) console.log(p, hits.length, hits.slice(0, 5));
  }
  const scriptStart = c.indexOf('document.addEventListener');
  if (scriptStart > 0) console.log('\nSCRIPT:\n', c.slice(scriptStart, scriptStart + 4000));
})();
