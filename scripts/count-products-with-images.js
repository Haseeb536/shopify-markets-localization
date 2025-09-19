require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  let withImages = 0;
  for (const gid of gids) {
    const p = await graphql(
      `query($id: ID!) { product(id: $id) { handle media(first:1){nodes{id}} images(first:1){edges{node{id}}} } }`,
      { id: gid }
    );
    if (p.product.media.nodes.length || p.product.images.edges.length) {
      withImages++;
      console.log(p.product.handle);
    }
  }
  console.log('with images:', withImages, '/', gids.length);
})();
