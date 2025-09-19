require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const TITLE_CHECKS = [
  /\bForja\b/i,
  /\bforgia\b/i,
  /\bSchmiede\b/i,
  /\bForge[a-zäöü]/i,
  /\bSchakelpook\b/i,
  /\bForgekühler\b/i,
  /\bForgeumluftventil\b/i,
  /\s+en\s+(?=[A-Z0-9])/i,
  /\bCambio\s+Corto\b/i,
  /\bcambio\s+corto\b/i,
  /\bchangement de vitesse court\b/i,
  /\bturbo Blanket\b/,
];

const BODY_CHECKS = [
  /^\s*-->\s*/m,
  /<p[^>]*>\s*-->\s*/i,
  /Forge automovilismo/i,
  /Forge sport automobile/i,
  /refroidisseur d'intermédiaire/i,
  /soupape de surpression/i,
  /valvola di sfiato/i,
  /válvula de soplado/i,
  /válvula de purga/i,
  /kit de Intercooler/i,
  /Kohlefaser-Carbon/i,
];

(async () => {
  const gids = await listAllProductGids();
  const hits = [];
  for (const gid of gids) {
    for (const loc of ['en', 'fr', 'de', 'it', 'es']) {
      const d = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: loc }
      );
      const title = d.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
      const body = (
        d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || ''
      ).replace(/<!--__JSONLD_BLOCK_\d+__-->/g, '');
      let bad = false;
      for (const re of TITLE_CHECKS) {
        if (re.test(title)) {
          hits.push({ id: gid.split('/').pop(), loc, where: 'title', pattern: re.source, snippet: title.match(re)?.[0] });
          bad = true;
          break;
        }
      }
      if (bad) continue;
      for (const re of BODY_CHECKS) {
        if (re.test(body)) {
          hits.push({ id: gid.split('/').pop(), loc, where: 'body', pattern: re.source, snippet: body.match(re)?.[0] });
          break;
        }
      }
    }
  }
  console.log('remaining issues:', hits.length);
  for (const h of hits.slice(0, 20)) console.log(h);
})();
