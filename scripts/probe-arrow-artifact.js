require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const id = 'gid://shopify/Product/10360887148891';
  for (const loc of ['nl', 'en', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
          translatableContent { key value locale }
        }
      }`,
      { id, l: loc }
    );
    let body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value;
    if (!body && loc === 'nl') {
      body = d.translatableResource.translatableContent.find((c) => c.key === 'body_html')?.value;
    }
    const idx = String(body || '').indexOf('-->');
    console.log(loc, 'idx', idx, body?.slice(Math.max(0, idx - 30), idx + 40));
  }
})();
