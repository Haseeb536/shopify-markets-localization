require('dotenv').config();
const fs = require('fs');
const { assertRequired, config } = require('../src/config');
const axios = require('axios');
const { getMainTheme } = require('../src/services/shopify.service');
const key = process.argv[2];
const out = process.argv[3];
if (!key) process.exit(1);
(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const v = res.data?.asset?.value || '';
  if (out) fs.writeFileSync(out, v, 'utf8');
  else console.log(v);
})();
