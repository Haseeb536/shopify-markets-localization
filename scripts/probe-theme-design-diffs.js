require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const themeId = '196825383259';
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const base = `${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`;

  for (const key of ['sections/header.liquid', 'templates/product.json', 'sections/main-product.liquid']) {
    const res = await axios.get(base, { params: { 'asset[key]': key }, headers });
    const v = res.data.asset.value || '';
    console.log('\n===', key, 'updated', res.data.asset.updated_at, '===');
    if (key.includes('header')) {
      console.log('jt_shop_name:', (v.match(/jt_shop_name/g) || []).length);
      console.log('shop.name:', (v.match(/shop\.name/g) || []).length);
      console.log('header.general.shop_name:', (v.match(/header\.general\.shop_name/g) || []).length);
      const logo = v.match(/header__logo-text[\s\S]{0,400}/);
      if (logo) console.log(logo[0].slice(0, 350));
    }
    if (key.includes('product.json')) {
      const j = JSON.parse(v);
      const desc = j.sections?.main?.blocks?.description?.settings;
      console.log('description display_mode:', desc?.display_mode);
      console.log('block_order:', j.sections?.main?.block_order);
    }
    if (key.includes('main-product')) {
      console.log('JT comment patches:', (v.match(/JT:/g) || []).length);
      console.log('product-info renders:', (v.match(/render\s+['"]product-info/g) || []).length);
    }
  }
})();
