/**
 * Structural storefront fix (catalog-wide):
 * - Theme nav / cart label / locale keys
 * - Shipping date month maps (per locale)
 * - All product titles (glossary: Inlaatkanaal, Oliekoeler, Carbon Intake, …)
 * - Variant option values (Zwart, Blauw, Red, …)
 *
 * Optional: --with-body  re-translate body_html (FAQ chunking; uses DeepL quota)
 * Optional: --retranslate-titles  full DeepL title pass (slow; default is glossary only)
 * Related product titles are glossary-fixed by default (recommendation graph).
 * Optional: --with-related-deepl  full DeepL pass on related products (slow)
 * Optional: --no-related  skip related-product title fixes
 * Optional: --no-repair-bodies  skip structural FAQ/dedupe pass (no DeepL)
 * Optional: --product-id <numeric id>  single product only
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { runCatalogStructuralFix } = require('../src/services/catalogStructuralFix.service');
function parseArgs() {
  const args = process.argv.slice(2);
  const withBody = args.includes('--with-body');
  const withRelatedDeepL = args.includes('--with-related-deepl');
  const noRelated = args.includes('--no-related');
  const retranslateTitles = args.includes('--retranslate-titles');
  const noRepairBodies = args.includes('--no-repair-bodies');
  const noTheme = args.includes('--no-theme');
  const noTitles = args.includes('--no-titles');
  const noOptions = args.includes('--no-options');
  const idIdx = args.indexOf('--product-id');
  let productGids;
  if (idIdx >= 0 && args[idIdx + 1]) {
    const id = String(args[idIdx + 1]).replace(/\D/g, '');
    productGids = [`gid://shopify/Product/${id}`];
  }
  return {
    bodies: withBody,
    repairBodies: !noRepairBodies,
    related: !noRelated,
    relatedDeepL: withRelatedDeepL,
    theme: !noTheme,
    titles: !noTitles,
    titleRetranslate: retranslateTitles,
    options: !noOptions,
    productGids,
  };
}

(async () => {
  assertRequired();
  const opts = parseArgs();
  // eslint-disable-next-line no-console
  console.log('Catalog structural fix v3', opts);
  let report;
  try {
    report = await runCatalogStructuralFix(opts);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Structural fix failed:', e.response?.data || e.message);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\n=== Structural fix complete ===');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('\nNext: npm run audit:structural');
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.response?.data || e.message);
  process.exit(1);
});
