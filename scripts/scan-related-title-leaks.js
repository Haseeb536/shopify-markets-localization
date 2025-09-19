require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const PATTERNS = [
  /Vervangingsfilter/i,
  /\bRadiateur\b/i,
  /válvula de descarga Kit/i,
  /soupape de recirculation Kit/i,
  /Induction Intake/i,
  /valvola di ricircolo Kit/i,
  /\ben\b.*Audi/i,
  /Verstelbare/i,
  /Siliconen/i,
];

(async () => {
  const gids = await listAllProductGids();
  const hits = [];
  for (const gid of gids) {
    for (const loc of ['de', 'fr', 'it', 'es', 'en']) {
      const d = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: loc }
      );
      const title = d.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
      if (PATTERNS.some((p) => p.test(title))) hits.push({ gid, loc, title });
    }
  }
  console.log('hits', hits.length);
  for (const h of hits) console.log(h.loc, h.title);
})();
