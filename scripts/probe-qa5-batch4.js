require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const NEEDLES = [
  /Turbo Blanket.*Swift Sport ZC33S/i,
  /control arm|draagarm/i,
  /actuator.*Ibiza|Ibiza.*actuator/i,
  /filter.*A45|A45.*filter|vervangingsfilter/i,
  /Short Shift.*(Polo|Fabia)/i,
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value }
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
    if (/Short Shift/i.test(title)) {
      for (const loc of ['fr', 'it', 'es']) {
        const b = t(loc, 'body_html').replace(/<[^>]+>/g, ' ').slice(0, 100);
        console.log(`  ${loc} body:`, b);
      }
    }
  }
  // all short shift titles
  console.log('\n--- ALL SHORT SHIFT TITLES ---');
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title } }`, { id: gid });
    if (!/short shift/i.test(d.product?.title || '')) continue;
    const tr = await graphql(
      `query($id: ID!) { translatableResource(resourceId: $id) { fr: translations(locale: "fr") { key value } it: translations(locale: "it") { key value } es: translations(locale: "es") { key value } } }`,
      { id: gid }
    );
    const t = (loc) => tr.translatableResource[loc].find((x) => x.key === 'title')?.value;
    console.log(gid.split('/').pop(), d.product.title);
    console.log('  fr:', t('fr'));
    console.log('  it:', t('it'));
    console.log('  es:', t('es'));
  }
})();
