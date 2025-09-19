/**
 * List NL source strings on product + product-page theme that lack a proper EN translation.
 * Usage: node scripts/audit-product-page-locale.js <productId> [locale]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired } = require('../src/config');
const { graphql, Gid, getMainTheme } = require('../src/services/shopify.service');

const JT_OVERRIDES = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, '../config/jt-locale-overrides.json'), 'utf8')
    );
  } catch {
    return {};
  }
})();

const productId = process.argv[2] || '10360905269595';
const locale = (process.argv[3] || 'en').toLowerCase().split('-')[0];

const THEME_PREFIXES = [
  'section.product.json',
  'section.sections/footer-group.json',
  'jt.product.',
  'jt.contact.',
  'jt.footer.',
];

const DUTCH_HINTS =
  /\b(je |het |de |een |voor |vanaf |verzending|retour|tevreden|klanten|naam|e-mail|meld |aanmel|bekijken|nodig|opnemen|whats|betaal|delen|gratis|werkdag|toepas|minpunten|aanbevolen|inlaat|oliekoeler|zwart|blauw|rood|kies |opties)\b/i;

function sameAsSource(nl, target) {
  if (!target || !nl) return true;
  return String(target).trim() === String(nl).trim();
}

function looksDutch(text) {
  return DUTCH_HINTS.test(String(text));
}

(async () => {
  assertRequired();
  const issues = [];

  const productGid = Gid.product(productId);
  const pdata = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: $locale) { key value }
      }
    }`,
    { id: productGid, locale }
  );
  const ptr = pdata.translatableResource;
  const pNl = new Map(
    (ptr?.translatableContent || [])
      .filter((c) => c.locale === 'nl' && c.value?.trim())
      .map((c) => [c.key, c.value])
  );
  const pTr = new Map((ptr?.translations || []).map((t) => [t.key, t.value]));

  const SKIP_PRODUCT = new Set(['handle', 'product_type', 'url_settings']);

  for (const [key, nl] of pNl) {
    if (SKIP_PRODUCT.has(key)) continue;
    const tr = pTr.get(key);
    if (!tr) issues.push({ scope: 'product', key, problem: 'missing', nl: nl.slice(0, 80) });
    else if (sameAsSource(nl, tr))
      issues.push({ scope: 'product', key, problem: 'unchanged', nl: nl.slice(0, 80), tr: tr.slice(0, 80) });
    else if (looksDutch(tr))
      issues.push({ scope: 'product', key, problem: 'still_dutch', nl: nl.slice(0, 60), tr: tr.slice(0, 80) });
  }

  const themeGid = (await getMainTheme()).id;
  const tdata = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: $locale) { key value }
      }
    }`,
    { id: themeGid, locale }
  );
  const ttr = tdata.translatableResource;
  const tNl = (ttr?.translatableContent || []).filter(
    (c) =>
      c.locale === 'nl' &&
      c.value?.trim() &&
      THEME_PREFIXES.some((p) => c.key.startsWith(p) || c.key === p.slice(0, -1))
  );
  const tTr = new Map((ttr?.translations || []).map((t) => [t.key, t.value]));

  for (const c of tNl) {
    const jtShort = c.key.startsWith('jt.') ? c.key.slice(3) : null;
    if (jtShort && JT_OVERRIDES[locale]?.[jtShort]) continue;

    const tr = tTr.get(c.key);
    if (/shopify:\/\//.test(c.value) || /^https?:\/\//.test(c.value)) continue;
    if (!tr) issues.push({ scope: 'theme', key: c.key, problem: 'missing', nl: c.value.slice(0, 80) });
    else if (sameAsSource(c.value, tr))
      issues.push({ scope: 'theme', key: c.key, problem: 'unchanged', nl: c.value.slice(0, 80), tr: tr.slice(0, 80) });
    else if (looksDutch(tr))
      issues.push({ scope: 'theme', key: c.key, problem: 'still_dutch', nl: c.value.slice(0, 60), tr: tr.slice(0, 80) });
  }

  console.log('Audit', productId, 'locale', locale, '— issues:', issues.length);
  for (const i of issues) {
    console.log(`\n[${i.scope}] ${i.problem}: ${i.key}`);
    console.log('  NL:', i.nl);
    if (i.tr) console.log('  TR:', i.tr);
  }
  process.exit(issues.length ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
