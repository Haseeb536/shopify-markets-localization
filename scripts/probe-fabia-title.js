require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
assertRequired();

(async () => {
  const d = await graphql(
    `query {
      products(first: 5, query: "Fabia Intake") {
        edges { node { id title } }
      }
    }`
  );
  const ids = d.products.edges.map((e) => e.node.id);
  const fix = await fixAllProductTitlesWithGlossary(ids);
  console.log('fix', fix);
  for (const { node } of d.products.edges) {
    const t = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: node.id, l: 'fr' }
    );
    const fr = t.translatableResource.translations.find((x) => x.key === 'title')?.value;
    console.log(node.title);
    console.log('FR:', fr || '(missing)');
  }
})();
