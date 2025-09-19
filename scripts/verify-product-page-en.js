require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');

const CHECK = [
  'Aanbevolen',
  'Gratis verzending vanaf',
  'Betaal',
  'Tuning advies',
  'Hulp nodig',
  'Contact opnemen',
  'Klantenservice',
  'Meld je aan',
];

(async () => {
  const gid = (await getMainTheme()).id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "en") { key value }
      }
    }`,
    { id: gid }
  );
  const en = data.translatableResource.translations || [];
  for (const needle of CHECK) {
    const hit = en.find((t) => t.value && t.value.includes(needle));
    if (hit) console.log('STILL DUTCH:', needle, 'in', hit.key);
    else console.log('OK (no dutch):', needle);
  }
  const good = en.filter(
    (t) =>
      t.key.includes('product.json') &&
      (t.value.includes('Recommended') ||
        t.value.includes('Need help') ||
        t.value.includes('Pay now') ||
        t.value.includes('Free'))
  );
  console.log('\nSample EN product.json translations:');
  good.slice(0, 8).forEach((t) => console.log(' ', t.value.replace(/\s+/g, ' ').slice(0, 70)));
})();
