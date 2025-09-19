require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const withSort = await graphql(
    `query {
      products(first: 50, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        edges { node { id } }
      }
    }`
  );
  console.log('with sortKey ID', withSort.products.pageInfo, withSort.products.edges.length);

  const noSort = await graphql(
    `query {
      products(first: 50) {
        pageInfo { hasNextPage endCursor }
        edges { node { id } }
      }
    }`
  );
  console.log('no sort', noSort.products.pageInfo, noSort.products.edges.length);

  const page2 = await graphql(
    `query($c: String) {
      products(first: 50, after: $c, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        edges { node { id } }
      }
    }`,
    { c: withSort.products.pageInfo.endCursor }
  );
  console.log('page2 with sort', page2.products.pageInfo, page2.products.edges.length);
})();
