require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "en") { key value }
      }
    }`,
    { id: 'gid://shopify/Product/10360905269595' }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const idx = body.toLowerCase().indexOf('direct mounting');
  console.log(
    JSON.stringify({
      hasLower: body.includes('<li>direct mounting</li>'),
      hasUpper: body.includes('<li>Direct mounting</li>'),
      snippet: idx >= 0 ? body.slice(Math.max(0, idx - 20), idx + 40) : null,
    })
  );
})();
