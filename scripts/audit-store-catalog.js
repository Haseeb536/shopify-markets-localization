/**
 * Catalog-wide translation audit (Shopify Translations API).
 * Usage: node scripts/audit-store-catalog.js
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  listAllProductGids,
  getMainTheme,
  getShopPublishedLocaleCodes,
  fetchTranslationsMap,
} = require('../src/services/shopify.service');

const DUTCH_IN_TRANSLATION =
  /\b(vermogenstoename|inlaatbocht|inlaatkanaal|oliekoeler|verwachte levering|eenvoudig retourneren|veelgestelde vragen|toevoegen aan winkelwagen|gratis verzending|tevreden klanten|aanbevolen voor|mijn winkel|winkelwagen)\b/i;

const NAV_MARKERS = /\b(My Store|Cart0|Categories|Contact|Catalog|Home)\b/;

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

async function auditProduct(gid, locales) {
  const issues = [];
  for (const locale of locales) {
    const data = await graphql(
      `query($id: ID!, $loc: String!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value locale }
          translations(locale: $loc) { key value }
        }
      }`,
      { id: gid, loc: locale }
    );
    const tr = data.translatableResource;
    const nlTitle = (tr?.translatableContent || []).find((c) => c.key === 'title' && norm(c.locale) === 'nl')?.value;
    const nlBody = (tr?.translatableContent || []).find((c) => c.key === 'body_html' && norm(c.locale) === 'nl')?.value;
    const tMap = new Map((tr?.translations || []).map((t) => [t.key, t.value]));
    const title = tMap.get('title') || '';
    const body = tMap.get('body_html') || '';

    if (!title?.trim()) issues.push({ locale, key: 'title', problem: 'missing' });
    else if (title.trim() === nlTitle?.trim()) issues.push({ locale, key: 'title', problem: 'same_as_nl' });
    else if (DUTCH_IN_TRANSLATION.test(title)) issues.push({ locale, key: 'title', problem: 'dutch_leak' });

    if (!body?.trim()) issues.push({ locale, key: 'body_html', problem: 'missing' });
    else if (body.trim() === nlBody?.trim()) issues.push({ locale, key: 'body_html', problem: 'same_as_nl' });
    else if (body.length < 200) issues.push({ locale, key: 'body_html', problem: 'too_short' });
    else if (DUTCH_IN_TRANSLATION.test(body)) issues.push({ locale, key: 'body_html', problem: 'dutch_leak' });
  }
  return issues;
}

async function auditThemeNav(themeGid, locales) {
  const issues = [];
  const navKeys = ['general.breadcrumbs.home', 'sections.header.cart'];
  for (const locale of locales) {
    const map = await fetchTranslationsMap(themeGid, locale);
    for (const k of navKeys) {
      const v = map.get(k);
      if (v && NAV_MARKERS.test(v)) issues.push({ locale, key: k, problem: 'english_nav', value: v });
    }
    const trust = map.get('jt.product.trust_tuners');
    if (trust && /\b(sintonizzator|sintonizador)\b/i.test(trust)) {
      issues.push({ locale, key: 'jt.product.trust_tuners', problem: 'bad_tuner_homonym', value: trust });
    }
  }
  return issues;
}

(async () => {
  assertRequired();
  const published = (await getShopPublishedLocaleCodes()).map(norm);
  const targets = config.locales.targets.map(norm).filter((l) => published.includes(l) && l !== 'nl');
  const notPublished = config.locales.targets.map(norm).filter((l) => !published.includes(l));

  console.log('=== Store translation audit ===\n');
  console.log('Source:', config.locales.source);
  console.log('Targets:', config.locales.targets.join(', '));
  console.log('Published:', published.join(', '));
  if (notPublished.length) console.log('NOT published:', notPublished.join(', '));
  console.log('');

  const gids = await listAllProductGids();
  console.log(`Products in catalog: ${gids.length}\n`);

  /** @type {Record<string, number>} */
  const counts = {};
  const samples = [];

  let i = 0;
  for (const gid of gids) {
    i += 1;
    const issues = await auditProduct(gid, targets);
    if (issues.length) {
      const id = gid.split('/').pop();
      samples.push({ id, issues });
      for (const iss of issues) {
        const k = `${iss.locale}:${iss.problem}:${iss.key}`;
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    if (i % 10 === 0) process.stdout.write(`  scanned ${i}/${gids.length}\r`);
  }
  console.log(`  scanned ${gids.length}/${gids.length}\n`);

  console.log('--- Product issues (aggregate) ---');
  if (!Object.keys(counts).length) {
    console.log('  None — all products have title + body per published locale.\n');
  } else {
    for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}x ${k}`);
    }
    console.log('\n--- Sample products with issues (max 8) ---');
    for (const s of samples.slice(0, 8)) {
      console.log(`  Product ${s.id}:`, s.issues.map((x) => `${x.locale}/${x.key}/${x.problem}`).join(', '));
    }
    console.log('');
  }

  const themeGid = (await getMainTheme()).id;
  const themeIssues = await auditThemeNav(themeGid, targets);
  console.log('--- Theme / nav (sample keys) ---');
  if (!themeIssues.length) console.log('  No obvious English nav or tuner homonym issues.\n');
  else {
    for (const t of themeIssues) console.log(`  ${t.locale} ${t.key}: ${t.problem} — ${String(t.value).slice(0, 60)}`);
    console.log('');
  }

  const productFail = samples.length;
  const exitCode = productFail > 0 || themeIssues.length > 5 ? 1 : 0;
  console.log(
    exitCode === 0
      ? 'VERDICT: API translations look complete for published locales.'
      : `VERDICT: ${productFail} product(s) need attention — run npm run fix:storefront-v3`
  );
  if (notPublished.includes('pl')) {
    console.log('NOTE: Polish (pl) is not published — enable in Shopify Languages, then re-run translate:store:full');
  }
  console.log('NOTE: Live storefront can differ from API (cache, Markets URL). Spot-check DE/FR/ES on site.');
  process.exit(exitCode);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
