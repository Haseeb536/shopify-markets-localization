require('dotenv').config();
const { graphql, Gid } = require('../src/services/shopify.service');

const productId = process.argv[2];
const locale = process.argv[3] || 'it';
const needles = process.argv.slice(4);

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
  const body = rows.find((t) => t.key === 'body_html')?.value || '';
  const check = needles.length
    ? needles
    : ['forcella', 'Frame', 'scarico', 'montabile direttamente', 'Staffa'];
  console.log('Locale', locale, 'body length', body.length);
  for (const n of check) {
    console.log(n, body.includes(n) ? 'FOUND' : 'ok');
  }
  if (process.env.DEBUG_SCARICO === '1') {
    let i = 0;
    while ((i = body.indexOf('scarico', i)) >= 0) {
      console.log('context:', body.slice(Math.max(0, i - 45), i + 55).replace(/\s+/g, ' '));
      i++;
    }
  }
})();
