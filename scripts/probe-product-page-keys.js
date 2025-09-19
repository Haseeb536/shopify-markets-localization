require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');

const NEEDLES = [
  'Aanbevolen',
  'Betaal nu',
  'Tuning advies',
  'Gratis verzending vanaf',
  'tevreden klanten',
  'Hulp nodig',
  'Contact opnemen',
  'Whatsapp',
  'Alle producten',
  'Klantenservice',
  'rechten voorbehouden',
  'Antwoord binnen',
  'Betaal',
  'delen',
  'Privacy',
  'Algemene',
  'Mail ons',
  'Meld je',
  'Naam',
  'E-mail',
];

(async () => {
  const gid = (await getMainTheme()).id;
  const data = await graphql(
    `query ThemeTrans($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
      }
    }`,
    { id: gid }
  );
  const rows = data.translatableResource.translatableContent || [];
  let n = 0;
  for (const { key, value, locale } of rows) {
    if (locale !== 'nl' || !value) continue;
    if (!NEEDLES.some((needle) => value.includes(needle))) continue;
    if (
      !key.includes('product.json') &&
      !key.includes('footer') &&
      !key.includes('three-column') &&
      !key.includes('header-group') &&
      !key.includes('three_column')
    ) {
      continue;
    }
    console.log(key);
    console.log('  =>', value.replace(/\s+/g, ' ').slice(0, 100));
    n++;
  }
  console.log('matches:', n);
})();
