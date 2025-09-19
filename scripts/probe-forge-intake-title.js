require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
(async () => {
  const d = await graphql(
    `query { products(first: 1, query: "Inlaatkanaal") { edges { node { id title } } } }`
  );
  const id = d.products.edges[0]?.node?.id;
  console.log('NL title:', d.products.edges[0]?.node?.title);
  for (const loc of ['fr', 'de', 'en']) {
    const t = await graphql(
      `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
      { id, l: loc }
    );
    console.log(loc, t.translatableResource.translations.find((x) => x.key === 'title')?.value);
  }
})();
