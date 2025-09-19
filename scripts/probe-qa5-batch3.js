require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const NEEDLES = [
  /Blow.?Off.*Swift Sport ZC33S/i,
  /Intercooler.*Megane 2/i,
  /Short Shift.*(Leon|Octavia)/i,
  /Silicone.*Swift Sport ZC33S|siliconen.*Swift Sport ZC33S/i,
  /Intercooler.*Yaris.*Gen/i,
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title handle }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value }
          en: translations(locale: "en") { key value }
          fr: translations(locale: "fr") { key value }
          de: translations(locale: "de") { key value }
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
    const bodySnippet = (loc) => t(loc, 'body_html').replace(/<[^>]+>/g, ' ').slice(0, 120);
    console.log('\n===', gid.split('/').pop(), title);
    console.log('  handle:', d.product.handle);
    for (const loc of ['en', 'fr', 'de', 'it', 'es']) {
      console.log(`  ${loc} title:`, t(loc));
      if (/Short Shift/i.test(title)) console.log(`  ${loc} body:`, bodySnippet(loc));
    }
  }
})();
