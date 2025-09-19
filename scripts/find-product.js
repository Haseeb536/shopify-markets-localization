require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');

const q = process.argv[2] || 'title:*Intercooler*Yaris*';

(async () => {
  assertRequired();
  const data = await graphql(
    `query($query: String!) {
      products(first: 15, query: $query) {
        nodes { id title handle }
      }
    }`,
    { query: q }
  );
  for (const p of data.products?.nodes || []) {
    console.log(p.id.split('/').pop(), p.title);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
