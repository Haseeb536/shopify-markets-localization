require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

assertRequired();

function setNested(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

async function putSingleKey(themeId, assetKey, dotKey, value) {
  const base = config.shopify.adminBaseUrl;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const get = await axios.get(`${base}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': assetKey },
    headers,
  });
  const json = JSON.parse(get.data.asset.value || '{}');
  setNested(json, dotKey, value);
  await axios.put(
    `${base}/themes/${themeId}/assets.json`,
    { asset: { key: assetKey, value: JSON.stringify(json, null, 2) } },
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
  const verify = JSON.parse(
    (
      await axios.get(`${base}/themes/${themeId}/assets.json`, {
        params: { 'asset[key]': assetKey },
        headers,
      })
    ).data.asset.value
  );
  const parts = dotKey.split('.');
  let cur = verify;
  for (const p of parts) cur = cur?.[p];
  return { assetKey, dotKey, value: cur };
}

(async () => {
  const theme = await getMainTheme();
  const themeId = String(theme.id).replace(/\D/g, '');
  const results = [];
  for (const loc of ['fr', 'it']) {
    results.push(await putSingleKey(themeId, `locales/${loc}.json`, 'header.general.shop_name', 'JT Products'));
  }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
