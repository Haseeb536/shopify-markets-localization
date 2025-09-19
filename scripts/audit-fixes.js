/**
 * Audit all fixes from QA rounds — intake SEO, brand, FR en, IT Kanal, DE body, artifacts.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const LOCALES = ['en', 'de', 'fr', 'it', 'es'];

const TITLE_FAIL = [
  { id: 'schmieden', re: /\bschmieden\b/i },
  { id: 'forja', re: /\bForja\b/i },
  { id: 'schmiede_brand', re: /\bSchmiede\b/i },
  { id: 'fr_et_fibre', re: /\bAdmission\s+et\s+fibre de carbone\b/i },
  { id: 'fr_et_carbone', re: /\badmission d'air par induction\s+et\s+carbone\b/i },
  { id: 'it_kanal', re: /\bKanal\b/i, locales: ['it'] },
  { id: 'weak_es_carbon', re: /^de fibra de carbono/i, locales: ['es'] },
  { id: 'weak_es_admision', re: /^de admisión\s+Forge/i, locales: ['es'] },
  { id: 'weak_de_einlass', re: /^einlass\s+Forge/i, locales: ['de'] },
  { id: 'missing_forge', re: /^(?!.*\bForge\b).+/i, nlMustHaveForge: true },
];

const BODY_FAIL = [
  { id: 'arrow_artifact', re: /-->/ },
  { id: 'de_aus_carbon', re: /\baus Carbon\b/i, locales: ['de'] },
  { id: 'de_das_ansaugung', re: /\bDas\s+<strong>Forge Carbon Induction Ansaugung/i, locales: ['de'] },
  { id: 'de_der_double', re: /\bDas\s+<strong>Der Forge/i, locales: ['de'] },
  { id: 'dutch_leak', re: /\b(Inlaatkanaal|Oliekoeler|Schakelpook|Vervangingsfilter)\b/i },
];

(async () => {
  const gids = await listAllProductGids();
  const issues = [];
  let titlesChecked = 0;
  let bodiesChecked = 0;

  for (const gid of gids) {
    const id = gid.split('/').pop();
    const base = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    const nlTitle = base.product?.title || '';

    const tr = await graphql(
      `query($id: ID!) {
        translatableResource(resourceId: $id) {
          en: translations(locale: "en") { key value }
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          it: translations(locale: "it") { key value }
          es: translations(locale: "es") { key value }
        }
      }`,
      { id: gid }
    );

    for (const loc of LOCALES) {
      const rows = tr.translatableResource[loc] || [];
      const title = rows.find((r) => r.key === 'title')?.value || '';
      const body = rows.find((r) => r.key === 'body_html')?.value || '';
      titlesChecked += 1;
      bodiesChecked += 1;

      for (const check of TITLE_FAIL) {
        if (check.locales && !check.locales.includes(loc)) continue;
        if (check.nlMustHaveForge && !/\bForge\b/i.test(nlTitle)) continue;
        if (check.nlMustHaveForge && /\bForge\b/i.test(title)) continue;
        if (check.re.test(title)) {
          issues.push({
            severity: 'fail',
            field: 'title',
            id,
            handle: base.product.handle,
            loc,
            check: check.id,
            snippet: title.slice(0, 100),
          });
        }
      }

      for (const check of BODY_FAIL) {
        if (check.locales && !check.locales.includes(loc)) continue;
        if (!body) continue;
        if (check.re.test(body)) {
          issues.push({
            severity: 'fail',
            field: 'body',
            id,
            handle: base.product.handle,
            loc,
            check: check.id,
            snippet: body.match(check.re)?.[0] || check.id,
          });
        }
      }
    }
  }

  // Key product spot-checks
  const spot = {};
  const yaris = await graphql(
    `query { productByHandle(handle: "forge-intake-inlaatkanaal-toyota-yaris-gr") { id } }`
  );
  const yid = yaris.productByHandle?.id;
  if (yid) {
    const t = await graphql(
      `query($id: ID!) {
        de: translatableResource(resourceId: $id) { translations(locale: "de") { key value } }
        it: translatableResource(resourceId: $id) { translations(locale: "it") { key value } }
      }`,
      { id: yid }
    );
    spot.yarisIntakeChannel = {
      de: t.de.translations.find((r) => r.key === 'title')?.value,
      it: t.it.translations.find((r) => r.key === 'title')?.value,
    };
  }

  console.log('=== FIX AUDIT ===\n');
  console.log(`Products: ${gids.length}`);
  console.log(`Titles checked: ${titlesChecked} | Bodies checked: ${bodiesChecked}`);
  console.log(`Automated failures: ${issues.length}\n`);

  if (issues.length) {
    for (const i of issues) console.log(i);
  } else {
    console.log('No automated pattern failures.\n');
  }

  console.log('--- Spot checks (Yaris Intake Channel) ---');
  console.log(spot.yarisIntakeChannel);

  console.log('\n--- Known data issues (not translation) ---');
  console.log('- Yaris intercooler Gen 1/2 title vs gen-3/gen-4 handles (2 products)');
  console.log('- Product image ALT: 0/50 products have media in Shopify admin');

  console.log('\n=== RESULT:', issues.length === 0 ? 'PASS' : 'FAIL', '===');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
