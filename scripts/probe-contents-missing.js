require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
const ID = 'gid://shopify/Product/10360905269595';
const NEEDLE = /instruction|install|montage|instructie|contenido|contenuti|inhalt/i;
(async () => {
  for (const loc of ['en', 'de', 'es', 'it', 'fr']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: ID, l: loc }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    const hits = body.match(NEEDLE) || [];
    console.log(loc, 'matches', hits.length, body.includes('Instructions') ? 'has Instructions' : '');
  }
})();
