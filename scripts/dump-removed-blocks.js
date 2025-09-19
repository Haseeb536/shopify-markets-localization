require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme, fetchTranslatableResource } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': 'templates/product.json' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const j = JSON.parse(res.data.asset.value);
  const main = j.sections.main;
  console.log('content_qVRxey:', JSON.stringify(main.blocks.content_qVRxey, null, 2));

  const tr = await fetchTranslatableResource(theme.id);
  const keys = (tr.translatableContent || []).filter((c) =>
    /content_qVRxey|content_VdNWWq|content_NXhqmi|delivery_info/.test(c.key)
  );
  console.log('\nTranslatable keys (nl source):');
  for (const c of keys.filter((x) => x.locale === 'nl' || !x.locale)) {
    console.log(c.key, '=>', String(c.value).slice(0, 200));
  }
})();
