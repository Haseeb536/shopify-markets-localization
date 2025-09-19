require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const id = 'gid://shopify/Product/10360887148891';
  const d = await graphql(
    `query($id: ID!) { tr: translatableResource(resourceId: $id) { translations(locale: "en") { key value } } }`,
    { id }
  );
  const body = d.tr.translations.find((t) => t.key === 'body_html')?.value || '';
  const idx = body.indexOf('-->');
  console.log('index', idx);
  if (idx >= 0) console.log(body.slice(Math.max(0, idx - 60), idx + 20));
})();
