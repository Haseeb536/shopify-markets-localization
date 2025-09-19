require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const p = await graphql(`query {
    productByHandle(handle: "forge-carbon-induction-intake-volkswagen-polo-6r-gti-1-4-tsi") {
      title
      images(first: 5) { edges { node { id altText } } }
      media(first: 5) { nodes { id alt ... on MediaImage { image { altText } } } }
    }
  }`);
  console.log(JSON.stringify(p.productByHandle, null, 2));
})();
