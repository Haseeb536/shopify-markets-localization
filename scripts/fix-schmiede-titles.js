require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const bad = [];
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
        }
      }`,
      { id: gid }
    );
    const t = d.translatableResource.de.find((x) => x.key === 'title')?.value || '';
    if (/\bSchmiede\b/i.test(t)) bad.push(gid);
  }
  console.log('Schmiede titles:', bad.length, bad.map((g) => g.split('/').pop()));
  if (bad.length) {
    const r = await fixAllProductTitlesWithGlossary(bad);
    console.log('Fixed:', r);
  }
})();
