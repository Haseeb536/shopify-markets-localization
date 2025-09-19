require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const yaris = gids.find(async () => false);
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    if (!/inlaatkanaal.*yaris|yaris.*inlaatkanaal/i.test(d.product.handle + d.product.title)) continue;
    const tr = await graphql(
      `query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value locale }
          de: translations(locale: "de") { key value }
          it: translations(locale: "it") { key value }
          fr: translations(locale: "fr") { key value }
        }
      }`,
      { id: gid }
    );
    console.log('GID', gid);
    console.log('Keys:', tr.translatableResource.translatableContent.map((c) => c.key));
    for (const loc of ['de', 'it', 'fr']) {
      const mt = tr.translatableResource[loc].find((t) => t.key === 'meta_title')?.value;
      const title = tr.translatableResource[loc].find((t) => t.key === 'title')?.value;
      console.log(loc, 'meta_title:', mt);
      console.log(loc, 'title:', title);
    }
    break;
  }
})();
