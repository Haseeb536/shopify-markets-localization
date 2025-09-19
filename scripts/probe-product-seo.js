require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const gid = 'gid://shopify/Product/10360905761115';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      product(id: $id) {
        title handle
        seo { title description }
      }
      translatableResource(resourceId: $id) {
        translatableContent { key value locale digest }
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: gid }
  );
  console.log('product.seo', d.product.seo);
  console.log('all keys', d.translatableResource.translatableContent);
  console.log('de translations keys', d.translatableResource.de.map((t) => t.key));
})();
