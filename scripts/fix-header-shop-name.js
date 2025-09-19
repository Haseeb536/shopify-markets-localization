require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

const THEME_ID = '196825383259';
const LOGO_LABEL =
  "{% if shop.name == 'My Store' or shop.name == 'Mijn winkel' %}JT-Products{% else %}{{ shop.name }}{% endif %}";

(async () => {
  const base = `${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const res = await axios.get(base, { params: { 'asset[key]': 'sections/header.liquid' }, headers });
  let content = res.data.asset.value || '';
  content = content.replace(
    /<span class="header__logo-text">[\s\S]*?<\/span>/,
    `<span class="header__logo-text">${LOGO_LABEL}</span>`
  );
  content = content.replace(
    /<span class="visually-hidden">[\s\S]*?<\/span>\s*<img class="header__logo-image"/,
    `<span class="visually-hidden">${LOGO_LABEL}</span>\n              <img class="header__logo-image"`
  );
  content = content.replace(
    /alt="\{\{ section\.settings\.logo\.alt \| default: shop\.name \| escape \}\}"/,
    'alt="JT-Products"'
  );
  await axios.put(
    base,
    { asset: { key: 'sections/header.liquid', value: content } },
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
  const ok = content.includes("shop.name == 'My Store'");
  console.log(JSON.stringify({ patched: ok }));
})();
