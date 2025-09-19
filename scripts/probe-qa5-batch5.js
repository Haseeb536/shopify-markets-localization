require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const NEEDLES = [
  /308 GTI MK2/i,
  /Polo 9N3/i,
  /Golf 5 R32.*A3|A3.*Golf 5 R32/i,
  /Yaris GR Gen/i,
  /Clio 4 RS.*1\.6T/i,
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title handle }
        translatableResource(resourceId: $id) {
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
    const bodySnip = (loc) => t(loc, 'body_html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140);
    console.log('\n===', gid.split('/').pop(), title);
    console.log('  handle:', d.product.handle);
    for (const loc of ['en', 'fr', 'it', 'es']) {
      console.log(`  ${loc} title:`, t(loc));
      if (/short shift/i.test(title)) console.log(`  ${loc} body:`, bodySnip(loc));
    }
  }

  console.log('\n--- ALL SHORT SHIFT BODY SNIPPETS ---');
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title } }`, { id: gid });
    if (!/short shift/i.test(d.product?.title || '')) continue;
    const tr = await graphql(
      `query($id: ID!) {
        translatableResource(resourceId: $id) {
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
        }
      }`,
      { id: gid }
    );
    const b = (loc) => {
      const html = tr.translatableResource[loc].find((x) => x.key === 'body_html')?.value || '';
      const m = html.match(/short shift|cambio corto|levier|palanca|changement/i);
      return m ? m[0] : html.replace(/<[^>]+>/g, ' ').slice(0, 80);
    };
    console.log(gid.split('/').pop(), d.product.title);
    console.log('  fr:', b('fr'));
    console.log('  it:', b('it'));
    console.log('  es:', b('es'));
  }

  console.log('\n--- YARIS GEN PRODUCTS ---');
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    if (!/Yaris GR Gen/i.test(d.product?.title || '')) continue;
    console.log(gid.split('/').pop(), '|', d.product.title, '|', d.product.handle);
  }
})();
