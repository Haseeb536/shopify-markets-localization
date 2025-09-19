require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, Gid } = require('../src/services/shopify.service');

const productId = process.argv[2] || '10360905269595';

(async () => {
  assertRequired();
  const id = Gid.product(productId);
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
      }
    }`,
    { id }
  );
  const rows = data.translatableResource?.translatableContent || [];
  const nl = rows.filter((r) => r.locale === 'nl' && r.value?.trim());
  console.log('NL translatable fields:', nl.length);
  for (const r of nl) {
    console.log('\n' + r.key);
    console.log(r.value.slice(0, 200).replace(/\s+/g, ' '));
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
