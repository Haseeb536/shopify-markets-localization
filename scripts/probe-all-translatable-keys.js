require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const keys = new Set();
  let withMeta = 0;
  for (const gid of gids) {
    const tr = await graphql(
      `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key } } }`,
      { id: gid }
    );
    for (const c of tr.translatableResource.translatableContent) keys.add(c.key);
    const hasMeta = tr.translatableResource.translatableContent.some((c) =>
      /meta_title|meta_description/.test(c.key)
    );
    if (hasMeta) withMeta += 1;
  }
  console.log('All keys:', [...keys]);
  console.log('Products with meta keys:', withMeta);
})();
