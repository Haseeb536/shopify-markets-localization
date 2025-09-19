require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = [
  'gid://shopify/Product/10360905761115', // yaris intake channel
  'gid://shopify/Product/10360905269595', // carbon yaris
  'gid://shopify/Product/10360906187099', // polo induction?
];

(async () => {
  for (const id of IDS) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { handle title }
        de: translatableResource(resourceId: $id) {
          translations(locale: "de") { key value }
        }
      }`,
      { id }
    );
    const body = d.de.translations.find((t) => t.key === 'body_html')?.value || '';
    console.log('\n', d.product.handle);
    const m1 = body.match(/<p>[^<]{0,120}/);
    console.log('DE open:', m1?.[0]);
    if (/Das\s+<strong>Forge Carbon Induction/i.test(body)) console.log('DAS issue');
    if (/aus Carbon/i.test(body)) console.log('aus Carbon issue');
  }
})();
