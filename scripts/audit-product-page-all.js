/**
 * Audit product page translations for all target + published locales.
 * Usage: node scripts/audit-product-page-all.js [productId]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  Gid,
  getMainTheme,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');

const productId = process.argv[2] || '10360905269595';

const JT_OVERRIDES = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, '../config/jt-locale-overrides.json'), 'utf8')
    );
  } catch {
    return {};
  }
})();

const THEME_PREFIXES = [
  'section.product.json',
  'section.sections/footer-group.json',
  'jt.product.',
  'jt.contact.',
  'jt.footer.',
];

/** Dutch-specific phrases (avoid false positives on FR "de", ES "de", etc.). */
const DUTCH_HINTS =
  /\b(het |een |vanaf €|verzending|verzend|retourneren|retour zonder|tevreden klanten|verwachte levering|bezorgicoon|toepasbaarheid|eenvoudig retour|gratis verzending|meld je aan|hulp nodig|contact opnemen|whatsapp ons|mail ons|privacyverklaring|algemene voorwaarden|vertrouwd door tuners|inlaatkanaal|oliekoeler|winkelwagen|toevoegen aan|jouw naam|e-mailadres|werkdag|betaal nu of later|tuning advies door|aanbevolen voor)\b/i;

const SKIP_PRODUCT = new Set(['handle', 'product_type', 'url_settings']);
const BENIGN_UNCHANGED = /^(<p>\s*<\/p>|info@|Reviews|Payment|Pairs well with|performance \?)$/i;

function sameAsSource(nl, target) {
  if (!target || !nl) return true;
  return String(target).trim() === String(nl).trim();
}

function looksDutch(text) {
  return DUTCH_HINTS.test(String(text));
}

function isBenignUnchanged(nl, tr) {
  const n = String(nl).trim();
  const t = String(tr).trim();
  if (BENIGN_UNCHANGED.test(n) || BENIGN_UNCHANGED.test(t)) return true;
  if (n === t && !looksDutch(n)) return true;
  if (/^<p><a href="mailto:/.test(n) && n === t) return true;
  return false;
}

async function fetchResource(gid, locale) {
  const data = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: $locale) { key value }
      }
    }`,
    { id: gid, locale }
  );
  return data.translatableResource;
}

function auditLocale(locale, productTr, themeTr) {
  const issues = [];
  const pNl = new Map(
    (productTr?.translatableContent || [])
      .filter((c) => c.locale === 'nl' && c.value?.trim())
      .map((c) => [c.key, c.value])
  );
  const pTr = new Map((productTr?.translations || []).map((t) => [t.key, t.value]));

  for (const [key, nl] of pNl) {
    if (SKIP_PRODUCT.has(key)) continue;
    const tr = pTr.get(key);
    if (!tr) issues.push({ scope: 'product', key, problem: 'missing', nl, tr: '' });
    else if (sameAsSource(nl, tr) && !isBenignUnchanged(nl, tr))
      issues.push({ scope: 'product', key, problem: 'unchanged', nl, tr });
    else if (looksDutch(tr))
      issues.push({ scope: 'product', key, problem: 'still_dutch', nl, tr });
  }

  const tNl = (themeTr?.translatableContent || []).filter(
    (c) =>
      c.locale === 'nl' &&
      c.value?.trim() &&
      THEME_PREFIXES.some((p) => c.key.startsWith(p))
  );
  const tTr = new Map((themeTr?.translations || []).map((t) => [t.key, t.value]));

  for (const c of tNl) {
    const jtShort = c.key.startsWith('jt.') ? c.key.slice(3) : null;
    if (jtShort && JT_OVERRIDES[locale]?.[jtShort]) continue;

    const tr = tTr.get(c.key);
    const nl = c.value;
    if (/shopify:\/\//.test(nl) || /^https?:\/\//.test(nl)) continue;

    if (!tr) issues.push({ scope: 'theme', key: c.key, problem: 'missing', nl, tr: '' });
    else if (sameAsSource(nl, tr) && !isBenignUnchanged(nl, tr))
      issues.push({ scope: 'theme', key: c.key, problem: 'unchanged', nl, tr });
    else if (looksDutch(tr))
      issues.push({ scope: 'theme', key: c.key, problem: 'still_dutch', nl, tr });
  }

  return issues;
}

(async () => {
  assertRequired();
  const productGid = Gid.product(productId);
  const themeGid = (await getMainTheme()).id;
  const published = new Set((await getShopPublishedLocaleCodes()).map((l) => l.toLowerCase().split('-')[0]));
  const configured = config.locales.targets.map((l) => l.toLowerCase().split('-')[0]);
  const locales = [...new Set([...configured, ...published])].filter((l) => l !== 'nl').sort();

  console.log('Product:', productId);
  console.log('Published on shop:', [...published].sort().join(', '));
  console.log('Configured targets:', configured.join(', '));
  console.log('');

  /** @type {Record<string, { issues: ReturnType<typeof auditLocale>, status: string }>} */
  const byLocale = {};

  for (const locale of locales) {
    if (!published.has(locale)) {
      byLocale[locale] = { issues: [], status: 'not_published' };
      continue;
    }
    const productTr = await fetchResource(productGid, locale);
    const themeTr = await fetchResource(themeGid, locale);
    const issues = auditLocale(locale, productTr, themeTr);
    const hasReal = issues.filter((i) => i.problem !== 'unchanged' || !isBenignUnchanged(i.nl, i.tr));
    byLocale[locale] = {
      issues,
      status: issues.length === 0 ? 'ok' : hasReal.length === 0 ? 'ok_minor' : 'issues',
    };
  }

  const header = 'Locale | Status        | Issues | Missing | Unchanged* | Still Dutch';
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const locale of locales) {
    const { issues, status } = byLocale[locale];
    if (status === 'not_published') {
      console.log(`${locale.padEnd(6)} | NOT PUBLISHED | —      | —       | —          | —`);
      continue;
    }
    const missing = issues.filter((i) => i.problem === 'missing').length;
    const unchanged = issues.filter((i) => i.problem === 'unchanged').length;
    const dutch = issues.filter((i) => i.problem === 'still_dutch').length;
    const label =
      status === 'ok' ? 'OK' : status === 'ok_minor' ? 'OK (minor)' : 'NEEDS WORK';
    console.log(
      `${locale.padEnd(6)} | ${label.padEnd(13)} | ${String(issues.length).padStart(6)} | ${String(missing).padStart(7)} | ${String(unchanged).padStart(10)} | ${String(dutch).padStart(11)}`
    );
  }

  console.log('\n* Unchanged includes emails, empty HTML, English labels already correct in NL source.\n');

  for (const locale of locales) {
    const { issues, status } = byLocale[locale];
    if (status === 'not_published' || status === 'ok' || status === 'ok_minor') continue;
    const real = issues.filter((i) => !(i.problem === 'unchanged' && isBenignUnchanged(i.nl, i.tr)));
    if (!real.length) continue;
    console.log(`\n### ${locale.toUpperCase()} — ${real.length} issue(s)`);
    for (const i of real.slice(0, 25)) {
      console.log(`  [${i.scope}] ${i.problem}: ${i.key}`);
      console.log(`    NL: ${String(i.nl).slice(0, 90).replace(/\s+/g, ' ')}`);
      if (i.tr) console.log(`    TR: ${String(i.tr).slice(0, 90).replace(/\s+/g, ' ')}`);
    }
    if (real.length > 25) console.log(`  … and ${real.length - 25} more`);
  }

  const failed = Object.entries(byLocale).filter(([, v]) => v.status === 'issues').length;
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
