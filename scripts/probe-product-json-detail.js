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
  console.log(JSON.stringify(j.sections.main, null, 2).slice(0, 4000));
  const custom = j.sections.custom_html_VAxCrJ;
  if (custom) console.log('\ncustom_html:', JSON.stringify(custom, null, 2).slice(0, 1500));
})();
