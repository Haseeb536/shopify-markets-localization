require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) { product(id: $id) { title } }`,
      { id: gid }
    );
    if (/Megane 3/i.test(d.product.title) && /radiat|Radiat|kühler|Kühler|koeler/i.test(d.product.title)) {
      console.log(gid, d.product.title);
    }
  }
})();
