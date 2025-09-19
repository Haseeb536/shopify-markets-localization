require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { fixRelatedProductTitlesCatalog } = require('../src/services/translateRelatedProducts.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const POLO = 'gid://shopify/Product/10360888623451';

async function frTitle(id) {
  const t = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id, l: 'fr' }
  );
  return t.translatableResource.translations.find((x) => x.key === 'title')?.value || '(missing)';
}

(async () => {
  const d = await graphql(
    `query {
      products(first: 5, query: "Polo 6R GTI Carbon") {
        edges { node { id title } }
      }
    }`
  );
  for (const { node } of d.products.edges) {
    console.log('SRC:', node.title);
    console.log('FR before:', await frTitle(node.id));
  }

  const related = await fixRelatedProductTitlesCatalog([FLAGSHIP], 3);
  console.log('related fix', related);

  const solo = await fixAllProductTitlesWithGlossary([POLO]);
  console.log('polo fix', solo);
  console.log('FR Polo after:', await frTitle(POLO));
})();
