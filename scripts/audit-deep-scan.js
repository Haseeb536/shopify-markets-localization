/**
 * Deep scan all products for fixable localization issues.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const LOCS = ['en', 'fr', 'de', 'it', 'es'];

const TITLE_SCAN = [
  { id: 'forja', re: /\bForja\b/i },
  { id: 'forgia', re: /\bforgia\b/i },
  { id: 'schmiede', re: /\bSchmiede\b/i },
  { id: 'forge_fused', re: /\bForge[a-zäöü]/i },
  { id: 'schakelpook', re: /\bSchakelpook\b/i },
  { id: 'dutch_en', re: /\s+en\s+(?=[A-Z0-9])/i },
  { id: 'dutch_in_title', re: /\b(Inlaatkanaal|Oliekoeler|Verstelbare|Siliconen|Vervangingsfilter|draagarmen|slangenset|Schakelpook)\b/i },
  { id: 'cambio_corto', re: /\bcambio\s+corto\b/i },
  { id: 'changement_court', re: /\bchangement de vitesse court\b/i },
  { id: 'levier_court', re: /\blevier de vitesses? court\b/i },
  { id: 'turbo_blanket_case', re: /\bturbo Blanket\b/ },
  { id: 'oil_cooler_radiator', re: /\boil cooler\b/i, onlyIfNl: /radiateur/i, excludeNl: /oliekoeler/i },
  { id: 'trailing_kit_forge', re: /\s+Kit\s+Forge/i, locales: ['fr', 'it', 'es'] },
];

const BODY_SCAN = [
  { id: 'leading_arrow', re: /^\s*-->\s*/m },
  { id: 'p_arrow', re: /<p[^>]*>\s*-->\s*/i },
  { id: 'forja', re: /\bForja\b/i },
  { id: 'forgia', re: /\bforgia\b/i },
  { id: 'schmiede', re: /\bSchmiede\b/i },
  { id: 'forge_fused', re: /\bForge[a-zäöü]/i },
  { id: 'ss_body_cambio', re: /\bkit de cambio corto\b/i },
  { id: 'ss_body_levier', re: /\blevier de vitesses court\b/i },
  { id: 'nl_heading', re: /<h2[^>]*>\s*(Eigenschappen|Technische specificaties|Veelgestelde vragen)\s*<\/h2>/i },
  { id: 'nl_body_leak', re: /\b(voor de |gemaakt van|is ontworpen|Veelgestelde vragen|gratis verzending)\b/i },
  { id: 'stray_dot_p', re: /<p>\s*\.\s*<\/p>/i },
];

(async () => {
  const gids = await listAllProductGids();
  const hits = [];
  const coverage = [];

  for (const gid of gids) {
    const id = gid.split('/').pop();
    const base = await graphql(`query($id: ID!) { product(id: $id) { title } }`, { id: gid });
    const nlTitle = base.product?.title || '';

    for (const loc of LOCS) {
      const d = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: loc }
      );
      const rows = d.translatableResource?.translations || [];
      const title = rows.find((t) => t.key === 'title')?.value || '';
      const body = (rows.find((t) => t.key === 'body_html')?.value || '').replace(
        /<!--__JSONLD_BLOCK_\d+__-->/g,
        ''
      );

      if (!title.trim()) coverage.push({ id, loc, field: 'title' });
      if (!body.trim()) coverage.push({ id, loc, field: 'body_html' });

      for (const rule of TITLE_SCAN) {
        if (rule.locales && !rule.locales.includes(loc)) continue;
        if (rule.onlyIfNl && !rule.onlyIfNl.test(nlTitle)) continue;
        if (rule.excludeNl && rule.excludeNl.test(nlTitle)) continue;
        if (rule.re.test(title)) {
          hits.push({ id, loc, field: 'title', check: rule.id, snippet: title.match(rule.re)?.[0] });
          break;
        }
      }

      for (const rule of BODY_SCAN) {
        if (rule.re.test(body)) {
          hits.push({ id, loc, field: 'body', check: rule.id, snippet: body.match(rule.re)?.[0] });
          break;
        }
      }
    }
  }

  console.log('Coverage gaps:', coverage.length);
  if (coverage.length) console.log(coverage.slice(0, 10));

  console.log('Fixable issues:', hits.length);
  const byCheck = {};
  for (const h of hits) byCheck[h.check] = (byCheck[h.check] || 0) + 1;
  console.log('By type:', byCheck);
  for (const h of hits) console.log(h);

  process.exit(hits.length || coverage.length ? 1 : 0);
})();
