require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const QUERIES = [
  /Subaru Impreza GT GC8/i,
  /Supra A90/i,
  /Leon Mk2 Cupra/i,
  /Megane 4 RS/i,
  /Yaris GR/i,
];

const DUTCH = /\b(De |Het |voor de |gemaakt van|eigenschappen|technische specificaties|vermogenstoename)\b/i;

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value locale }
          en: translations(locale: "en") { key value }
        }
      }`,
      { id: gid }
    );
    const title = d.product?.title || '';
    if (!QUERIES.some((q) => q.test(title))) continue;
    const nlBody = d.translatableResource.nl.find((c) => c.key === 'body_html')?.value || '';
    const enBody = d.translatableResource.en.find((c) => c.key === 'body_html')?.value || '';
    console.log('\n---', gid.split('/').pop(), title);
    console.log('EN body missing:', !enBody.trim());
    console.log('EN body dutch:', DUTCH.test(enBody));
    console.log('EN snippet:', (enBody || nlBody).slice(0, 120).replace(/\s+/g, ' '));
  }
})();
