require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const gid = 'gid://shopify/Product/10360892227931';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        it: translations(locale: "it") { key value }
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: gid }
  );
  console.log('IT', d.translatableResource.it.find((x) => x.key === 'title')?.value);
  console.log('DE', d.translatableResource.de.find((x) => x.key === 'title')?.value);
})();
