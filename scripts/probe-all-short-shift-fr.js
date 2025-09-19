require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const p = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    if (!/short shift/i.test(p.product.title)) continue;
    const tr = await graphql(
      `query($id: ID!) { fr: translatableResource(resourceId: $id) { translations(locale: "fr") { key value } } }`,
      { id: gid }
    );
    const title = tr.fr.translations.find((t) => t.key === 'title')?.value || '';
    const body = tr.fr.translations.find((t) => t.key === 'body_html')?.value || '';
    if (/changement|levier.*court|cambio corto/i.test(title)) {
      console.log('TITLE ISSUE', p.product.handle, title);
    }
    if (/changement de vitesse court|levier de vitesses court/i.test(body)) {
      console.log('BODY ISSUE', p.product.handle);
    }
    if (/seat-leon|octavia/i.test(p.product.handle)) {
      console.log('Seat/Octavia FR title:', title);
    }
  }
})();
