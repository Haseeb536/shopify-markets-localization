require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

(async () => {
  const themeId = '196825383259';
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  for (const loc of ['nl', 'de', 'en', 'es', 'fr', 'it']) {
    const assetKey = loc === 'en' ? 'locales/en.default.json' : `locales/${loc}.json`;
    try {
      const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
        params: { 'asset[key]': assetKey },
        headers,
      });
      const j = JSON.parse(res.data.asset.value || '{}');
      console.log(loc, j?.header?.general?.shop_name ?? '(missing)');
    } catch (e) {
      console.log(loc, 'error', e.message);
    }
  }
})();
