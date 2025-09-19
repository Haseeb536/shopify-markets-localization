require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const THEME_ID = '196825383259';

(async () => {
  const shop = await graphql(`query { shop { name } }`);
  const base = `${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const hres = await axios.get(base, { params: { 'asset[key]': 'sections/header.liquid' }, headers });
  const header = hres.data.asset.value || '';
  const logoSnippet = header.match(/<span class="header__logo-text">[\s\S]*?<\/span>/)?.[0] || '';

  const checks = {};
  for (const locale of ['de', 'fr', 'en', 'it', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FLAGSHIP, l: locale }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    checks[locale] = {
      strayDot: /<strong>\.\s*<h2>/i.test(body) || /<\/p><strong>Toyota<\/strong>\s*Yaris<\/p><strong>\./i.test(body),
      directMounting: /<li>direct mounting<\/li>/.test(body),
      wieviel: /Wieviel Leistungszuwachs/i.test(body),
      compatibility: body.includes('<p><strong>Toyota</strong> Yaris</p>'),
    };
  }

  console.log(JSON.stringify({ shopName: shop.shop.name, logoSnippet, checks }, null, 2));
})();
