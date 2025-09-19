require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  console.log('listAllProductGids', gids.length);

  let cursor = null;
  let total = 0;
  let hasFabia = false;
  for (;;) {
    const d = await graphql(
      `query($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title status } }
        }
      }`,
      { cursor }
    );
    for (const { node } of d.products.edges) {
      total += 1;
      if (String(node.id).includes('10335289803099')) hasFabia = true;
      if (/fabia|polo 6r/i.test(node.title)) {
        console.log(node.status, node.id.split('/').pop(), node.title);
      }
    }
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  console.log('all products paginated', total, 'hasFabia', hasFabia);
})();
