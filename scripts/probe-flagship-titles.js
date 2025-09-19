require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, fetchTranslatableResource } = require('../src/services/shopify.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  const tr = await fetchTranslatableResource(FLAGSHIP);
  const nl = (tr.translatableContent || []).find((c) => c.key === 'title')?.value;
  console.log('NL source:', nl);
  for (const loc of ['de', 'fr', 'en', 'it', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FLAGSHIP, l: loc }
    );
    const title = d.translatableResource.translations.find((t) => t.key === 'title')?.value;
    console.log(loc, title);
  }
})();
