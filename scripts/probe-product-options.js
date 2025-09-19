require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, Gid, fetchTranslatableResource } = require('../src/services/shopify.service');

const productId = process.argv[2] || '10360905269595';

(async () => {
  assertRequired();
  const id = Gid.product(productId);
  const data = await graphql(
    `query($id: ID!) {
      product(id: $id) {
        options {
          id
          name
          values
          optionValues { id name }
        }
        variants(first: 30) {
          nodes { id title selectedOptions { name value } }
        }
      }
    }`,
    { id }
  );
  console.log('Options:', JSON.stringify(data.product?.options, null, 2));
  console.log('Variants sample:', JSON.stringify(data.product?.variants?.nodes?.slice(0, 5), null, 2));

  for (const opt of data.product?.options || []) {
    for (const val of opt.values || []) {
      // option value GIDs are not in product query — probe by translatableResources
    }
  }

  const types = ['PRODUCT_OPTION', 'PRODUCT_OPTION_VALUE', 'PRODUCT_VARIANT'];
  for (const resourceType of types) {
    try {
      const tr = await graphql(
        `query($type: TranslatableResourceType!) {
          translatableResources(first: 5, resourceType: $type) {
            edges { node { resourceId translatableContent { key value locale } } }
          }
        }`,
        { type: resourceType }
      );
      console.log('\nType', resourceType, 'sample:', tr.translatableResources?.edges?.length);
      const first = tr.translatableResources?.edges?.[0]?.node;
      if (first) console.log(JSON.stringify(first, null, 2));
    } catch (e) {
      console.log('Type', resourceType, 'error:', e.message);
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
