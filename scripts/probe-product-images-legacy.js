require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const d = await graphql(`{
    products(first: 3) {
      edges {
        node {
          handle
          images(first: 2) { edges { node { id altText url } } }
          media(first: 2) { nodes { id alt ... on MediaImage { image { altText url } } } }
        }
      }
    }
  }`);
  console.log(JSON.stringify(d.products.edges, null, 2));
})();
