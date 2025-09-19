require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = [
  '10360900714843',
  '10360901960027',
  '10360906613083',
  '10360906875227',
  '10360906187099',
];

(async () => {
  for (const id of IDS) {
    const gid = `gid://shopify/Product/${id}`;
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title }
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
        }
      }`,
      { id: gid }
    );
    const t = (loc) => d.translatableResource[loc].find((x) => x.key === 'title')?.value || '';
    console.log('\n', id, d.product.title);
    for (const loc of ['de', 'fr', 'it', 'es']) console.log(`  ${loc}:`, t(loc));
  }
})();
