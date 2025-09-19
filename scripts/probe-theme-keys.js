require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');

const NEEDLES = ['Vertrouwd', 'Verwachte levering', 'Gratis verzending', 'product-price', 'product-meta'];

(async () => {
  const theme = await getMainTheme();
  const gid = theme.id;
  const data = await graphql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key value locale } } }`,
    { id: gid }
  );
  const rows = data?.translatableResource?.translatableContent || [];
  let found = 0;
  for (const { key, value } of rows) {
    if (NEEDLES.some((n) => key.includes(n) || (value && value.includes(n)))) {
      console.log(key, '=>', String(value).slice(0, 100));
      found++;
    }
  }
  console.log('total rows', rows.length, 'matches:', found);
})();
