require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const tr = await graphql(
      `query($id: ID!) {
        product(id: $id) { handle title }
        fr: translatableResource(resourceId: $id) { translations(locale: "fr") { key value } }
      }`,
      { id: gid }
    );
    const title = tr.fr.translations.find((t) => t.key === 'title')?.value || '';
    if (/changement|levier.*court/i.test(title)) {
      console.log(tr.product.handle, '|', title);
    }
  }
})();
