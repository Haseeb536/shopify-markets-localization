require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = ['10360907694427', '10360907989339'];
(async () => {
  for (const id of IDS) {
    const gid = `gid://shopify/Product/${id}`;
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title handle }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value locale }
        }
      }`,
      { id: gid }
    );
    const nlTitle = d.translatableResource.nl.find((c) => c.key === 'title')?.value;
    console.log(id);
    console.log('  NL title:', nlTitle);
    console.log('  handle:  ', d.product.handle);
    console.log('  EN title:', d.product.title);
  }
})();
