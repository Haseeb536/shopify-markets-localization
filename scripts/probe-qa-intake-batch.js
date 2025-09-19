require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const HANDLES = [
  'forge-intake-inlaatkanaal-toyota-yaris-gr',
  'forge-carbon-fiber-intake-toyota-yaris-gr-g16e',
  'forge-carbon-fiber-induction-intake-suzuki-swift-sport-zc33s-1',
  'forge-intake-renault-megane-4-rs-1-8t',
  'forge-carbon-induction-intake-volkswagen-polo-6r-gti-1-4-tsi',
];

(async () => {
  for (const handle of HANDLES) {
    const p = await graphql(`query($q: String!) { productByHandle(handle: $q) { id title } }`, { q: handle });
    const id = p.productByHandle?.id;
    if (!id) { console.log('missing', handle); continue; }
    const tr = await graphql(
      `query($id: ID!) {
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
        }
      }`,
      { id }
    );
    console.log('\n===', handle);
    for (const loc of ['de', 'fr', 'it', 'es']) {
      const title = tr.translatableResource[loc].find((t) => t.key === 'title')?.value;
      const body = tr.translatableResource[loc].find((t) => t.key === 'body_html')?.value || '';
      console.log(`  ${loc}:`, title);
      if (loc === 'de' && /Das\s+<strong>Der|aus Carbon|Das\s+<strong>Forge Carbon Induction/i.test(body)) {
        console.log('    BODY ISSUE');
      }
    }
  }
})();
