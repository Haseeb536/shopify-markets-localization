require('dotenv').config();

const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');

(async () => {
  try {
    assertRequired();
    const data = await graphql(`{ shop { name myshopifyDomain } }`, {});
    // eslint-disable-next-line no-console
    console.log('Shopify OK:', JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Shopify test failed:', e.message);
    process.exit(1);
  }
})();
