/**
 * Audit the 8 structural issues from QA review.
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  getMainTheme,
  listAllProductGids,
  getShopPublishedLocaleCodes,
  fetchTranslationsMap,
} = require('../src/services/shopify.service');
const FLAGSHIP = '10360905269595';
const DUTCH_TITLE_WORDS = /\b(Inlaatkanaal|Oliekoeler|oliekoeler|inlaatkanaal)\b/i;
const NAV_EN = /\b(My Store|Cart\d+|^Home$|Categories|Contact|Catalog)\b/;
const DUTCH_VARIANTS = /\b(Zwart|Blauw|Wit|Rood|Groen)\b/;
const ENGLISH_VARIANTS_ON_NON_EN = /\b(^(Black|Blue|Red|White)$)\b/i;
const FAQ_MERGE_ES = /[.!?]\s+¿[^<]{15,}\?/i;
const FAQ_MERGE_FR = /\?[^<]{0,30}(?:Comment|Pourquoi|Quelle|Est-ce)[^<]{10,}\?/i;
const DUPLICATE_CARBON_ES =
  /Fabricado en fibra de carbono brillante[\s\S]{0,200}Hecho de fibra de carbono con acabado brillante/i;
const DE_BAD_INTAKE = /Carbon-Ansaugstutzen|Kohlefaser Ansaugstutzen/i;
const IT_BAD_GRAMMAR = /\buna tubo\b/i;
const ENGLISH_MONTH_RANGE = /\d{1,2}\s+jan\b|\d{1,2}\s+jun\b/i;
const DE_GOOD_MONTH = /\d{1,2}\.\s+Juni\b/i;
const FR_GOOD_MONTH = /\d{1,2}\s+juin\b/i;
const IT_GOOD_MONTH = /\d{1,2}\s+giugno\b/i;
const ES_GOOD_MONTH = /\d{1,2}\s+junio\b/i;
const NL_GOOD_MONTH = /\d{1,2}\s+juni\b/i;

function gid(id) {
  return `gid://shopify/Product/${id}`;
}

function pass(label, ok, detail = '') {
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

(async () => {
  assertRequired();
  const published = (await getShopPublishedLocaleCodes()).map((l) => l.toLowerCase().split('-')[0]);
  const targets = config.locales.targets.filter((l) => published.includes(l) && l !== 'nl');
  const themeGid = (await getMainTheme()).id;

  console.log('=== Structural issues audit ===\n');
  console.log('Published:', published.join(', '));
  console.log('');

  /** @type {Record<string, boolean>} */
  const results = {};

  // 1. Theme / menu / cart
  console.log('## 1. Theme / menu / cart');
  const navLabels = ['My Store', 'Home', 'Categories', 'Contact', 'Catalog', 'Cart'];
  let navFails = [];
  // Untranslated EN/NL literals per locale ("Contact" is valid in FR — same spelling).
  const badNavByLocale = {
    de: ['My Store', 'Home', 'Categories', 'Contact', 'Catalog', 'Cart', 'Cart0', 'Cart6'],
    fr: ['My Store', 'Home', 'Categories', 'Catalog', 'Cart', 'Cart0', 'Cart6'],
    it: ['My Store', 'Home', 'Categories', 'Contact', 'Catalog', 'Cart', 'Cart0', 'Cart6'],
    es: ['My Store', 'Home', 'Categories', 'Contact', 'Catalog', 'Cart', 'Cart0', 'Cart6'],
  };
  for (const locale of targets) {
    if (locale === 'en') continue;
    const bad = badNavByLocale[locale] || badNavByLocale.de;
    const map = await fetchTranslationsMap(themeGid, locale);
    for (const [, v] of map.entries()) {
      const val = String(v || '').trim();
      if (bad.includes(val) || /^Cart\d+$/.test(val)) navFails.push(`${locale}: "${val}"`);
    }
    const crumb =
      map.get('general.breadcrumb.home') || map.get('general.breadcrumbs.home');
    if (locale === 'de' && crumb === 'Home') navFails.push('de: breadcrumb still Home');
    if (locale === 'it' && crumb === 'Home') navFails.push('it: breadcrumb still Home');
  }
  results.nav = pass('Nav strings localized (API)', navFails.length === 0, navFails.slice(0, 3).join('; ') || 'no English nav literals in theme keys');

  // 2. Dates in flagship product body
  console.log('\n## 2. Date localization (flagship product body)');
  const pdata = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "de") { key value }
      }
    }`,
    { id: gid(FLAGSHIP) }
  );
  const deBody = pdata.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';
  const frData = await graphql(
    `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
    { id: gid(FLAGSHIP), l: 'fr' }
  );
  const itData = await graphql(
    `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
    { id: gid(FLAGSHIP), l: 'it' }
  );
  const esData = await graphql(
    `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
    { id: gid(FLAGSHIP), l: 'es' }
  );
  const frBody = frData.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';
  const itBody = itData.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';
  const esBody = esData.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';

  const deDate = DE_GOOD_MONTH.test(deBody) || !ENGLISH_MONTH_RANGE.test(deBody);
  const frDate = FR_GOOD_MONTH.test(frBody) || !/\d{1,2}\s+jun\b/i.test(frBody);
  const esDate = ES_GOOD_MONTH.test(esBody) || !/\d{1,2}\s+jun\b/i.test(esBody);
  const itDate = IT_GOOD_MONTH.test(itBody) || !/\d{1,2}\s+jun\b/i.test(itBody);
  results.datesDe = pass('DE dates (Juni or no English jun)', deDate, DE_GOOD_MONTH.test(deBody) ? 'found Juni' : ENGLISH_MONTH_RANGE.test(deBody) ? 'still English jun' : 'no date range in body');
  results.datesFr = pass('FR dates (juin)', frDate);
  results.datesIt = pass('IT dates (giugno)', itDate);
  results.datesEs = pass('ES dates (junio)', esDate);

  // 3. Dutch in titles (related products pattern)
  console.log('\n## 3. Dutch fragments in product titles');
  const gids = await listAllProductGids();
  let dutchTitleCount = 0;
  const dutchSamples = [];
  for (const g of gids) {
    for (const loc of targets) {
      const d = await graphql(
        `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
        { id: g, l: loc }
      );
      const title = d.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
      if (DUTCH_TITLE_WORDS.test(title)) {
        dutchTitleCount += 1;
        if (dutchSamples.length < 5) dutchSamples.push(`${g.split('/').pop()} ${loc}: ${title.slice(0, 55)}`);
      }
    }
  }
  results.dutchTitles = pass('No Inlaatkanaal/Oliekoeler in titles', dutchTitleCount === 0, dutchSamples.join(' | ') || `${dutchTitleCount} hits`);

  // 4. Variant values on flagship
  console.log('\n## 4. Variant values (flagship)');
  const prod = await graphql(
    `query($id: ID!) { product(id: $id) { options { optionValues { id name } } } }`,
    { id: gid(FLAGSHIP) }
  );
  let variantFails = [];
  for (const ov of prod.product?.options?.[0]?.optionValues || []) {
    for (const loc of ['de', 'fr', 'es', 'it']) {
      const tr = await graphql(
        `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
        { id: ov.id, l: loc }
      );
      const v = tr.translatableResource?.translations?.find((t) => t.key === 'value')?.value || '';
      if (DUTCH_VARIANTS.test(v) || (loc !== 'en' && v === 'Red' && ov.name === 'Rood')) {
        variantFails.push(`${loc} ${ov.name}->${v}`);
      }
    }
  }
  if (!prod.product?.options?.[0]?.optionValues?.length) {
    pass('Variant options', true, 'no color options on flagship — skip');
    results.variants = true;
  } else {
    results.variants = pass('Variant colors translated', variantFails.length === 0, variantFails.join(', '));
  }

  // 5. FAQ structure FR/ES
  console.log('\n## 5. FAQ parsing (flagship body)');
  results.faqFr = pass('FR: no merged FAQ questions in body', !FAQ_MERGE_FR.test(frBody));
  results.faqEs = pass('ES: no merged ¿ questions in paragraph', !FAQ_MERGE_ES.test(esBody));

  // 6. Duplicate ES carbon lines
  console.log('\n## 6. Duplicate content (ES)');
  results.dedupeEs = pass('ES: no duplicate carbon fiber list lines', !DUPLICATE_CARBON_ES.test(esBody));

  // 7. DE automotive terminology
  console.log('\n## 7. Automotive terminology (DE flagship title)');
  const deTitle = pdata.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
  results.deTerms = pass('DE title: no Carbon-Ansaugstutzen', !DE_BAD_INTAKE.test(deTitle), deTitle.slice(0, 70));

  // 8. IT grammar
  console.log('\n## 8. Grammar (IT flagship body)');
  results.itGrammar = pass('IT: no "una tubo"', !IT_BAD_GRAMMAR.test(itBody));

  // Summary
  console.log('\n=== Summary ===');
  const entries = Object.entries(results);
  const passed = entries.filter(([, v]) => v).length;
  const failed = entries.filter(([, v]) => !v).map(([k]) => k);
  console.log(`${passed}/${entries.length} checks passed`);
  if (failed.length) {
    console.log('Still failing:', failed.join(', '));
    console.log('\nRun: npm run fix:storefront-v3');
  } else {
    console.log('All structural checks passed on API data.');
    console.log('Confirm on live storefront (cache/Markets): DE, FR, ES, IT');
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
