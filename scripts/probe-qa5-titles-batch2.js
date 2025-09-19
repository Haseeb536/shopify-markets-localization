require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const NEEDLES = [
  /Short Shift.*Yaris/i,
  /Silicone.*Megane|Megane.*silicon/i,
  /Radiator.*Megane|Megane.*radiator/i,
  /Schakelpook/i,
  /Recirculation.*Clio|Clio.*recircul/i,
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value locale }
          en: translations(locale: "en") { key value }
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
        }
      }`,
      { id: gid }
    );
    const title = d.product?.title || '';
    if (!NEEDLES.some((n) => n.test(title))) continue;
    const t = (loc, key = 'title') =>
      d.translatableResource[loc].find((x) => x.key === key)?.value || '';
    console.log('\n===', gid.split('/').pop(), title);
    for (const loc of ['en', 'de', 'fr', 'it', 'es']) console.log(`  ${loc}:`, t(loc));
    console.log('  NL:', t('nl'));
  }
})();
