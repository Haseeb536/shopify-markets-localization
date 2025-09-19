require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');
assertRequired();

const FALLBACK_SNIPPET = `{% capture jt_shop_name %}{{ 'header.general.shop_name' | t }}{% endcapture %}
{% if jt_shop_name == blank or jt_shop_name contains 'header.general' or jt_shop_name contains 'Translation missing' %}JT Products{% else %}{{ jt_shop_name }}{% endif %}`;

const REPLACEMENTS = [
  ["{{ 'header.general.shop_name' | t }}", FALLBACK_SNIPPET],
];

(async () => {
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const base = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const res = await axios.get(base, { params: { 'asset[key]': 'sections/header.liquid' }, headers });
  let content = res.data?.asset?.value || '';
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (content.includes(from) && !content.includes('jt_shop_name')) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (!changed) {
    console.log(JSON.stringify({ patched: false, note: 'already_patched_or_pattern_missing' }));
    return;
  }
  await axios.put(
    base,
    { asset: { key: 'sections/header.liquid', value: content } },
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
  console.log(JSON.stringify({ patched: true, occurrences: (content.match(/jt_shop_name/g) || []).length }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
