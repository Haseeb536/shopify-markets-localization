/**
 * Full catalog translation audit — all products × published target locales.
 * Usage: node scripts/audit-catalog-full.js
 * Output: data/catalog-audit-report.json + console summary
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  listAllProductGids,
  fetchTranslatableResource,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');

assertRequired();

const OUT = path.join(process.cwd(), 'data', 'catalog-audit-report.json');

const DUTCH_BODY =
  /\b(Het |voor de |gemaakt van|is ontworpen|is vervaardigd|Veelgestelde vragen|Eigenschappen|Technische specificaties|Compatibiliteit|Inhoud van de set|vermogenstoename|inlaatbocht|inlaatkanaal|oliekoeler|gratis verzending|tevreden klanten)\b/i;

const DUTCH_TITLE =
  /\b(Inlaatkanaal|Oliekoeler|Verstelbare|Siliconen|Vervangingsfilter|draagarmen|slangenset)\b/i;

const NL_HEADING_IN_BODY =
  /<h2[^>]*>\s*(Eigenschappen|Technische specificaties|Veelgestelde vragen|Compatibiliteit|Inhoud van de set)\s*<\/h2>/i;

const TITLE_ISSUES = [
  { id: 'leading_intake', re: /^(Intake|intake)\s+/ },
  { id: 'intake_mid_fr_it_es', re: /\bIntake\s+(Canal|Canale|Conducto|Kanal)/i, locales: ['fr', 'it', 'es', 'de'] },
  { id: 'dutch_en_conjunction', re: /\s+en\s+(?=[A-Z0-9])/i, locales: ['de', 'it', 'fr', 'es'] },
  { id: 'trailing_kit_forge', re: /\s+Kit\s+Forge/i, locales: ['fr', 'it', 'es'] },
];

const BODY_ISSUES = [
  { id: 'jsonld_placeholder', re: /__JSONLD_BLOCK_/ },
  { id: 'faq_merged_es', re: /[.!?]\s+¿[^<]{12,}\?/ },
  { id: 'broken_list', re: /<li>([^<]+)\.\s*(?=<li>)/ },
  { id: 'stray_dot_p', re: /<p>\s*\.\s*<\/p>/ },
];

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

async function getProductTitle(gid) {
  const tr = await fetchTranslatableResource(gid);
  return (tr.translatableContent || []).find((c) => c.key === 'title')?.value || '';
}

async function auditProduct(gid, nlTitle, locales) {
  const id = gid.split('/').pop();
  const row = { id, gid, nlTitle, locales: {}, issues: [] };

  let nlBody = '';
  try {
    const base = await fetchTranslatableResource(gid);
    nlBody = (base.translatableContent || []).find((c) => c.key === 'body_html')?.value || '';
  } catch {
    row.issues.push({ scope: 'product', problem: 'fetch_failed' });
    return row;
  }

  for (const locale of locales) {
    const data = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: gid, l: locale }
    );
    const tMap = new Map((data.translatableResource?.translations || []).map((t) => [t.key, t.value]));
    const title = tMap.get('title') || '';
    const body = tMap.get('body_html') || '';
    const locIssues = [];

    if (!title.trim()) locIssues.push({ key: 'title', problem: 'missing' });
    else if (title.trim() === nlTitle.trim()) locIssues.push({ key: 'title', problem: 'same_as_nl' });
    else if (DUTCH_TITLE.test(title)) locIssues.push({ key: 'title', problem: 'dutch_leak' });
    else {
      for (const rule of TITLE_ISSUES) {
        if (rule.locales && !rule.locales.includes(locale)) continue;
        if (rule.re.test(title)) locIssues.push({ key: 'title', problem: rule.id });
      }
    }

    if (!body.trim()) locIssues.push({ key: 'body_html', problem: 'missing' });
    else if (body.trim() === nlBody.trim()) locIssues.push({ key: 'body_html', problem: 'same_as_nl' });
    else if (body.length < 200) locIssues.push({ key: 'body_html', problem: 'too_short' });
    else {
      if (DUTCH_BODY.test(body)) locIssues.push({ key: 'body_html', problem: 'dutch_leak' });
      if (NL_HEADING_IN_BODY.test(body)) locIssues.push({ key: 'body_html', problem: 'nl_heading' });
      for (const rule of BODY_ISSUES) {
        if (rule.re.test(body)) locIssues.push({ key: 'body_html', problem: rule.id });
      }
    }

    row.locales[locale] = {
      title: title.slice(0, 120),
      bodyLen: body.length,
      bodyH2: (body.match(/<h2[^>]*>([^<]+)/gi) || []).slice(0, 4).map((h) => h.replace(/<[^>]+>/g, '')),
      issues: locIssues,
    };
    for (const iss of locIssues) {
      row.issues.push({ locale, ...iss });
    }
  }
  return row;
}

(async () => {
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l) && l !== 'nl');
  const gids = await listAllProductGids();

  console.log('=== Full catalog translation audit ===\n');
  console.log(`Products: ${gids.length} | Locales: ${targets.join(', ')}\n`);

  /** @type {Record<string, number>} */
  const aggregate = {};
  /** @type {typeof products} */
  const products = [];
  let clean = 0;

  for (let i = 0; i < gids.length; i++) {
    const gid = gids[i];
    const nlTitle = await getProductTitle(gid);
    const row = await auditProduct(gid, nlTitle, targets);
    products.push(row);
    if (!row.issues.length) clean += 1;
    for (const iss of row.issues) {
      const k = `${iss.locale}:${iss.key}:${iss.problem}`;
      aggregate[k] = (aggregate[k] || 0) + 1;
    }
    process.stdout.write(`  ${i + 1}/${gids.length}\r`);
  }
  console.log(`  ${gids.length}/${gids.length} scanned\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    shop: config.shopify.shopDomain,
    sourceLocale: config.locales.source,
    targetLocales: targets,
    productCount: gids.length,
    cleanProducts: clean,
    productsWithIssues: gids.length - clean,
    aggregate,
    products: products.filter((p) => p.issues.length),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('--- Summary ---');
  console.log(`  Clean products (0 issues): ${clean}/${gids.length}`);
  console.log(`  Products with issues:    ${gids.length - clean}/${gids.length}`);
  console.log('');

  if (Object.keys(aggregate).length) {
    console.log('--- Issue counts (locale:key:problem) ---');
    for (const [k, n] of Object.entries(aggregate).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}× ${k}`);
    }
    console.log('\n--- Products with issues ---');
    for (const p of report.products) {
      const byLoc = {};
      for (const iss of p.issues) {
        const tag = `${iss.key}/${iss.problem}`;
        if (!byLoc[iss.locale]) byLoc[iss.locale] = [];
        byLoc[iss.locale].push(tag);
      }
      const summary = Object.entries(byLoc)
        .map(([loc, tags]) => `${loc}(${[...new Set(tags)].join(',')})`)
        .join(' ');
      console.log(`  ${p.id}  ${p.nlTitle.slice(0, 55)}`);
      console.log(`         ${summary}`);
    }
  } else {
    console.log('  No issues detected across title + body_html for all locales.');
  }

  console.log(`\nFull report: ${OUT}`);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
