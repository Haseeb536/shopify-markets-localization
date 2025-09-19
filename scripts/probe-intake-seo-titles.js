require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const HANDLES = [
  'forge-intake-inlaatkanaal-toyota-yaris-gr',
  'forge-carbon-fiber-intake-toyota-yaris-gr-g16e',
  'forge-carbon-fiber-induction-intake-volkswagen-polo-6r',
  'forge-carbon-fiber-induction-intake-suzuki-swift-sport-zc33s',
  'forge-intake-renault-megane-4-rs',
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const p = await graphql(`query($id: ID!) { product(id: $id) { handle title } }`, { id: gid });
    if (!HANDLES.some((h) => p.product.handle.includes(h.split('-').slice(-3).join('-')) || HANDLES.includes(p.product.handle))) {
      if (!HANDLES.includes(p.product.handle) && !/intake|inlaat|induction|carbon/i.test(p.product.handle)) continue;
    }
    if (!HANDLES.includes(p.product.handle) && !/yaris|polo|suzuki|megane/i.test(p.product.handle)) continue;
    const tr = await graphql(
      `query($id: ID!) {
        product(id: $id) { handle title seo { title description } }
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
          en: translations(locale: "en") { key value }
        }
      }`,
      { id: gid }
    );
    console.log('\n===', p.product.handle);
    console.log('NL', p.product.title);
    for (const loc of ['de', 'fr', 'it', 'es', 'en']) {
      const title = tr.translatableResource[loc].find((t) => t.key === 'title')?.value;
      const meta = tr.translatableResource[loc].find((t) => t.key === 'meta_title')?.value;
      const body = tr.translatableResource[loc].find((t) => t.key === 'body_html')?.value || '';
      const metaDesc = tr.translatableResource[loc].find((t) => t.key === 'meta_description')?.value;
      console.log(`  ${loc} title:`, title);
      if (meta) console.log(`  ${loc} meta_title:`, meta);
      if (metaDesc) console.log(`  ${loc} meta_desc:`, metaDesc?.slice(0, 100));
      if (/Carbon.*aus Carbon|DAS Forge Carbon Induction/i.test(body)) console.log(`  ${loc} body issue detected`);
    }
  }
})();
