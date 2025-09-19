require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  let withAlt = 0;
  let empty = 0;
  const sample = await graphql(
    `query($id: ID!) {
      product(id: $id) {
        title
        featuredMedia { id alt preview { image { altText } } }
        media(first: 1) { nodes { ... on MediaImage { id alt image { altText } } } }
      }
    }`,
    { id: gids[0] }
  );
  console.log('sample', JSON.stringify(sample.product, null, 2));
  for (const gid of gids.slice(0, 5)) {
    const p = await graphql(
      `query($id: ID!) {
        product(id: $id) {
          handle
          featuredMedia { alt preview { image { altText } } }
          media(first: 1) { nodes { ... on MediaImage { alt image { altText } } } }
        }
      }`,
      { id: gid }
    );
    const alt = p.product?.featuredMedia?.alt || p.product?.media?.nodes?.[0]?.alt || p.product?.featuredMedia?.preview?.image?.altText;
    if (alt?.trim()) withAlt++;
    else empty++;
    console.log(p.product.handle, 'alt=', JSON.stringify(alt));
  }
})();
