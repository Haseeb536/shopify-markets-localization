require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = ['10360905269595', '10360905761115', '10360887771483', '10360887542107'];
(async () => {
  for (const id of IDS) {
    const gid = `gid://shopify/Product/${id}`;
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title handle }
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
        }
      }`,
      { id: gid }
    );
    console.log('\n', id, d.product.handle);
    for (const loc of ['de', 'fr', 'it']) {
      const title = d.translatableResource[loc].find((t) => t.key === 'title')?.value;
      const body = d.translatableResource[loc].find((t) => t.key === 'body_html')?.value || '';
      const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
      console.log(loc, 'title:', title);
      console.log(loc, 'body:', text);
    }
  }
})();
