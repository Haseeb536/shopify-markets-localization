require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const bad = [];
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { handle options { name values } }
        de: translatableResource(resourceId: $id) { translations(locale: "de") { key value } }
        en: translatableResource(resourceId: $id) { translations(locale: "en") { key value } }
      }`,
      { id: gid }
    );
    for (const loc of ['de', 'en']) {
      const rows = d[loc]?.translations || [];
      for (const r of rows) {
        if (!r.key.includes('option')) continue;
        if (/Klammern|No Clamps/i.test(r.value)) {
          bad.push({ handle: d.product.handle, loc, key: r.key, value: r.value });
        }
      }
    }
  }
  console.log('clamp wording issues:', bad.length);
  bad.forEach((b) => console.log(b));
})();
