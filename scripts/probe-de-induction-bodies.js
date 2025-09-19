require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const HANDLES = [
  'forge-carbon-fiber-induction-intake-suzuki-swift-sport-zc33s-1',
  'forge-carbon-induction-intake-volkswagen-polo-6r-gti-1-4-tsi',
];

(async () => {
  for (const handle of HANDLES) {
    const p = await graphql(`query($q: String!) { productByHandle(handle: $q) { id } }`, { q: handle });
    const id = p.productByHandle.id;
    const d = await graphql(
      `query($id: ID!) { tr: translatableResource(resourceId: $id) { translations(locale: "de") { key value } } }`,
      { id }
    );
    const body = d.tr.translations.find((t) => t.key === 'body_html')?.value || '';
    console.log('\n', handle, id.split('/').pop());
    console.log(body.substring(0, 280));
  }
})();
