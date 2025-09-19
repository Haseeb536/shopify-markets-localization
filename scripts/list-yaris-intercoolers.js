require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) { product(id: $id) { title handle status } }`,
      { id: gid }
    );
    if (/yaris gr/i.test(d.product.title) && /intercooler/i.test(d.product.title)) {
      console.log(d.product.status, gid.split('/').pop(), d.product.title, '|', d.product.handle);
    }
  }
})();
