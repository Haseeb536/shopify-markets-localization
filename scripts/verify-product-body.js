require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const id = `gid://shopify/Product/${process.argv[2] || '10360900256091'}`;

(async () => {
  for (const loc of ['en', 'de', 'fr', 'it', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id, l: loc }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    const h2 = (body.match(/<h2[^>]*>([^<]+)/i) || [])[1] || '';
    console.log(loc, 'len', body.length, 'h2:', h2, '|', body.slice(0, 90).replace(/\s+/g, ' '));
  }
})();
