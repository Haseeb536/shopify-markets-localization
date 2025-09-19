require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const gid = 'gid://shopify/Product/10360889835867';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      product(id: $id) {
        options { name values }
        variants(first: 20) { nodes { title selectedOptions { name value } } }
      }
      translatableResource(resourceId: $id) {
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: gid }
  );
  console.log('options', d.product.options);
  const de = d.translatableResource.de;
  const opts = de.filter((t) => t.key.includes('option'));
  console.log('DE option translations:', opts.slice(0, 20));
})();
