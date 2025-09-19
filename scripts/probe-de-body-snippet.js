require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const id = 'gid://shopify/Product/10360905269595';
  const d = await graphql(
    `query($id: ID!) {
      de: translatableResource(resourceId: $id) {
        translations(locale: "de") { key value }
      }
    }`,
    { id }
  );
  const body = d.de.translations.find((t) => t.key === 'body_html')?.value || '';
  const idx = body.indexOf('Carbon');
  console.log(body.slice(Math.max(0, idx - 80), idx + 200));
})();
