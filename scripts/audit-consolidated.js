/**
 * Consolidated localization audit — terminology, coverage, Short Shift, Gen mismatch.
 * Usage: node scripts/audit-consolidated.js
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const TARGETS = ['en', 'fr', 'de', 'it', 'es'];

const TITLE_CHECKS = [
  { id: 'forja', re: /\bForja\b/i },
  { id: 'forgia', re: /\bforgia\b/i },
  { id: 'schmiede', re: /\bSchmiede\b/i },
  { id: 'forge_fused', re: /\bForge[a-zäöü]/i },
  { id: 'schakelpook', re: /\bSchakelpook\b/i },
  { id: 'forgekuehler', re: /\bForgekühler\b/i },
  { id: 'forgeumluft', re: /\bForgeumluftventil\b/i },
  { id: 'dutch_en', re: /\s+en\s+(?=[A-Z0-9])/i, skipLocales: ['fr'] },
  { id: 'cambio_corto_title', re: /\bcambio\s+corto\b/i },
  { id: 'changement_court', re: /\bchangement de vitesse court\b/i },
  { id: 'turbo_blanket_case', re: /\bturbo Blanket\b/ },
];

const BODY_CHECKS = [
  { id: 'leading_arrow', re: /^\s*-->\s*/m },
  { id: 'p_arrow', re: /<p[^>]*>\s*-->\s*/i },
  { id: 'forja_body', re: /\bForja\b/i },
  { id: 'forgia_body', re: /\bforgia\b/i },
  { id: 'forge_automovilismo', re: /Forge automovilismo/i },
  { id: 'forge_sport_auto', re: /Forge sport automobile/i },
];

const SHORT_SHIFT_BODY_BAD = [
  /\bkit de cambio corto\b/i,
  /\bkit cambio corto\b/i,
  /\blevier de vitesses court\b/i,
  /\blevier de vitesse court\b/i,
  /\bchangement de vitesse court\b/i,
];

const DUTCH_TITLE = /\b(Inlaatkanaal|Oliekoeler|Verstelbare|Siliconen|Vervangingsfilter|draagarmen|slangenset|Schakelpook)\b/i;

(async () => {
  const gids = await listAllProductGids();
  const terminology = [];
  const coverage = [];
  const shortShift = [];
  const genMismatch = [];
  let products = 0;

  for (const gid of gids) {
    products += 1;
    const id = gid.split('/').pop();

    const base = await graphql(
      `query($id: ID!) {
        product(id: $id) { title handle }
        translatableResource(resourceId: $id) {
          translatableContent { key value locale }
        }
      }`,
      { id: gid }
    );
    const nlTitle = base.product?.title || '';
    const handle = base.product?.handle || '';
    const titleGen = nlTitle.match(/Gen\s*(\d+)/i);
    const handleGen = handle.match(/gen-(\d+)/i);
    if (titleGen && handleGen && Number(titleGen[1]) !== Number(handleGen[1])) {
      genMismatch.push({
        id,
        title: nlTitle,
        handle,
        titleGen: Number(titleGen[1]),
        handleGen: Number(handleGen[1]),
      });
    }

    const isShortShift = /short shift/i.test(nlTitle);

    for (const loc of TARGETS) {
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

      if (!title.trim() || !body.trim()) {
        coverage.push({ id, loc, missing: !title.trim() ? 'title' : 'body_html' });
      }

      for (const { id: checkId, re, skipLocales } of TITLE_CHECKS) {
        if (skipLocales?.includes(loc)) continue;
        if (re.test(title)) {
          terminology.push({ id, loc, where: 'title', check: checkId, snippet: title.match(re)?.[0] });
          break;
        }
      }

      for (const { id: checkId, re } of BODY_CHECKS) {
        if (re.test(body)) {
          terminology.push({ id, loc, where: 'body', check: checkId, snippet: body.match(re)?.[0] });
          break;
        }
      }

      if (isShortShift && loc !== 'en') {
        for (const re of SHORT_SHIFT_BODY_BAD) {
          if (re.test(body)) {
            shortShift.push({ id, loc, pattern: re.source, snippet: body.match(re)?.[0] });
            break;
          }
        }
      }

      if (DUTCH_TITLE.test(title) && loc !== 'nl') {
        terminology.push({ id, loc, where: 'title', check: 'dutch_fragment', snippet: title.match(DUTCH_TITLE)?.[0] });
      }
    }
  }

  console.log('=== LOCALIZATION AUDIT ===\n');
  console.log(`Products scanned: ${products}`);
  console.log(`Target locales: ${TARGETS.join(', ')}\n`);

  console.log('--- Coverage gaps ---');
  console.log(coverage.length ? coverage : 'None');

  console.log('\n--- Terminology issues (title/body) ---');
  console.log(`Total: ${terminology.length}`);
  for (const h of terminology.slice(0, 25)) console.log(h);
  if (terminology.length > 25) console.log(`... and ${terminology.length - 25} more`);

  console.log('\n--- Short Shift body consistency ---');
  console.log(shortShift.length ? shortShift : 'All Short Shift bodies use locked term');

  console.log('\n--- Gen title vs handle mismatch ---');
  console.log(genMismatch.length ? genMismatch : 'None');

  const ok =
    coverage.length === 0 &&
    terminology.length === 0 &&
    shortShift.length === 0;
  console.log(`\n=== RESULT: ${ok ? 'PASS' : 'ISSUES FOUND'} ===`);
})();
