require('dotenv').config();
const { graphql, Gid } = require('../src/services/shopify.service');

const productId = process.argv[2];
const locale = process.argv[3] || 'it';
const terms = process.argv.slice(4);

(async () => {
  const data = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value }
      }
    }`,
    { id: Gid.product(productId), locale }
  );
  const rows = data.translatableResource?.translations || [];
  for (const row of rows) {
    if (!row.value) continue;
    const hits = terms.filter((t) => row.value.toLowerCase().includes(t.toLowerCase()));
    if (!hits.length) continue;
    console.log('\n===', row.key, '===');
    for (const t of hits) {
      let i = 0;
      while ((i = row.value.toLowerCase().indexOf(t.toLowerCase(), i)) >= 0) {
        console.log(
          '…',
          row.value.slice(Math.max(0, i - 50), i + t.length + 50).replace(/\s+/g, ' ')
        );
        i++;
      }
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
