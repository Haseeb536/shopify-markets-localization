/**
 * Align Yaris GR intercooler URL handles with product titles (Gen 1/2).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const FIXES = [
  {
    gid: 'gid://shopify/Product/10360907694427',
    handle: 'forge-intercooler-kit-toyota-yaris-gr-gen-1',
  },
  {
    gid: 'gid://shopify/Product/10360907989339',
    handle: 'forge-intercooler-kit-toyota-yaris-gr-gen-2',
  },
];

(async () => {
  for (const { gid, handle } of FIXES) {
    const before = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    console.log('Before:', before.product.title, '|', before.product.handle);
    const res = await graphql(
      `mutation($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id handle }
          userErrors { field message }
        }
      }`,
      { input: { id: gid, handle } }
    );
    const errs = res.productUpdate?.userErrors || [];
    if (errs.length) {
      console.error('Failed:', errs);
      continue;
    }
    console.log('After:', res.productUpdate.product.handle);
  }
})();
