require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const base = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const list = await axios.get(base, { headers });
  const keys = (list.data.assets || []).map((a) => a.key).filter((k) => /\.liquid$|\.json$/.test(k));
  const needles = ['Cart0', 'Cart6', 'My Store', 'Mijn winkel'];
  for (const key of keys) {
    const res = await axios.get(base, { headers, params: { 'asset[key]': key } });
    const v = res.data?.asset?.value || '';
    for (const n of needles) {
      if (v.includes(n)) console.log(key, '=>', n);
    }
  }
})();
