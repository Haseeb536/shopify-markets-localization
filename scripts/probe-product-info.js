require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  for (const key of ['sections/main-product.liquid', 'snippets/product-info.liquid']) {
    const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/196825383259/assets.json`, {
      params: { 'asset[key]': key },
      headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    });
    const c = res.data?.asset?.value || '';
    const renders = [...c.matchAll(/render\s+['"]product-info/gi)].map((m) => m.index);
    const buy = (c.match(/buy_buttons|product_meta|variant_selector/gi) || []).length;
    console.log(key, 'len', c.length, 'product-info renders', renders.length, 'buy/meta refs', buy);
    if (key.includes('product-info')) {
      const dup = c.includes('product_meta') && c.includes('for block');
      console.log('  has block loop', dup);
      const lines = c.split('\n').filter((l) => /product_meta|buy_buttons|when\s+'product_meta'/.test(l));
      console.log('  lines:', lines.slice(0, 15).join('\n    '));
    }
  }
})();
