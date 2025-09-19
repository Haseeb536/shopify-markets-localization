require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
const Q = `
  query($q: String!) {
    products(first: 25, query: $q) {
      edges { node { id title } }
    }
  }
`;
(async () => {
  for (const q of ['Inlaatkanaal', 'Oliekoeler', 'Forge Intake']) {
    const d = await graphql(Q, { q });
    console.log('\n', q);
    for (const e of d.products.edges) console.log(' ', e.node.title);
  }
})();
