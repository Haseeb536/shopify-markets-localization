/**
 * Audit all QA issues from vendor report — API + theme checks.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { graphql, getMainTheme, listAllProductGids } = require('../src/services/shopify.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const { toDeepLTarget } = require('../src/services/deepl.service');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const POLO_COLOR = 'gid://shopify/Product/10360888623451';
const LOCALES = ['en', 'de', 'fr', 'it', 'es'];

function rate(fixed, quality) {
  return { fixed, quality, score: fixed ? quality : 0 };
}

async function fetchBody(gid, loc) {
  const d = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id: gid, l: loc }
  );
  return d.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';
}

async function fetchTitle(gid, loc) {
  const d = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id: gid, l: loc }
  );
  return d.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
}

async function fetchOptionTranslations(productGid) {
  const p = await graphql(
    `query($id: ID!) {
      product(id: $id) {
        options { name optionValues { id name } }
      }
    }`,
    { id: productGid }
  );
  const opt = p.product?.options?.[0];
  if (!opt?.optionValues?.length) return { hasColors: false, values: [] };

  const values = [];
  for (const ov of opt.optionValues) {
    const row = { catalog: ov.name, locales: {} };
    for (const loc of LOCALES) {
      const d = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: ov.id, l: loc }
      );
      row.locales[loc] =
        d.translatableResource?.translations?.find((t) => t.key === 'name')?.value || '(missing)';
    }
    values.push(row);
  }
  return { hasColors: true, optionName: opt.name, values };
}

function auditFaq(body) {
  const glued =
    /<br><br>[^<]{8,}?\?\s*<strong>/i.test(body) ||
    /\?[^<]{0,40}(?:How|What|Was|Wie|Comment|Pourquoi|Quali|¿Cuánto)/i.test(
      body.replace(/<strong>[^<]+<\/strong>/gi, '')
    );
  const dupAnswer = /<\/strong><br>[^<]+<br><br>[^<]{20,}<br><br>[^<]{8,}?\?\s*<strong>/i.test(
    body
  );
  const strongCount = (body.match(/<strong>/gi) || []).length;
  const faqSection = body.match(/<h2[^>]*>[^<]*(?:FAQ|frequen|gestellte|Questions|Preguntas)[^<]*<\/h2>/i);
  return { glued, dupAnswer, strongCount, hasFaq: !!faqSection, ok: !glued && !dupAnswer && strongCount >= 3 };
}

function auditSetContents(body) {
  const m = body.match(
    /<h2[^>]*>[^<]*(?:Contenido|Contenuto|Contents|Inhalt|Contenu)[^<]*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i
  );
  if (!m) return { hasBlock: false, items: 0, hasInstall: false };
  const inner = m[1];
  const items = (inner.match(/<li/gi) || []).length;
  const hasInstall =
    /<li[^>]*>[^<]*(?:instrucciones de instalación|istruzioni di montaggio|installation instructions|einbauanleitung|instructions d'installation)/i.test(
      inner
    );
  return { hasBlock: true, items, hasInstall };
}

async function fetchThemeLocaleKey(assetKey, keyPath) {
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': assetKey },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 30000,
  });
  const json = JSON.parse(res.data?.asset?.value || '{}');
  const parts = keyPath.split('.');
  let cur = json;
  for (const p of parts) {
    cur = cur?.[p];
  }
  return cur;
}

async function fetchShippingSnippet() {
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': 'snippets/dynamic-shipping-calculator.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 30000,
  });
  return res.data?.asset?.value || '';
}

(async () => {
  assertRequired();
  const glossary = loadGlossary(config.paths.glossary);
  const report = [];

  // 1. FAQ duplication flagship
  const faqByLocale = {};
  for (const loc of LOCALES) {
    const body = await fetchBody(FLAGSHIP, loc);
    faqByLocale[loc] = auditFaq(body);
  }
  const faqAllOk = Object.values(faqByLocale).every((f) => f.ok);
  const faqWorst = Object.entries(faqByLocale).filter(([, v]) => !v.ok);
  report.push({
    id: 'P1-1',
    issue: 'FAQ duplication / glued questions (EN, IT, DE, FR)',
    ...rate(faqAllOk, faqAllOk ? 9 : 4),
    detail: faqWorst.length ? `Still bad: ${faqWorst.map(([l]) => l).join(', ')}` : 'All 5 locales clean on flagship',
    evidence: faqByLocale,
  });

  // 2. Variant colors
  const colors = await fetchOptionTranslations(POLO_COLOR);
  const expected = { Zwart: { de: 'Schwarz', fr: 'Noir', en: 'Black' }, Blauw: { de: 'Blau', fr: 'Bleu' }, Rood: { de: 'Rot', fr: 'Rouge' } };
  let colorOk = colors.hasColors;
  const colorIssues = [];
  if (colors.hasColors) {
    for (const v of colors.values) {
      if (v.catalog === 'Red') colorIssues.push('NL source still Red not Rood');
      if (['Zwart', 'Blauw', 'Rood'].includes(v.catalog)) {
        for (const [loc, exp] of Object.entries(expected[v.catalog] || {})) {
          if (v.locales[loc] !== exp) colorIssues.push(`${v.catalog} ${loc}: got "${v.locales[loc]}" want "${exp}"`);
        }
      } else if (['Black', 'Blue', 'Red'].includes(v.catalog)) {
        colorIssues.push(`English catalog value: ${v.catalog}`);
      }
    }
  }
  colorOk = colorOk && colorIssues.length === 0;
  report.push({
    id: 'P1-2',
    issue: 'Variant colors Zwart/Blauw/Rood translated',
    ...rate(colorOk, colorOk ? 9 : 5),
    detail: colorIssues.length ? colorIssues.join('; ') : `Option "${colors.optionName}" — ${colors.values.length} values OK`,
    evidence: colors,
  });

  // 3. FR Dutch leaks in titles (sample catalog)
  const gids = (await listAllProductGids()).slice(0, 50);
  const dutchInTitles = [];
  const badFrTerms = [];
  for (const gid of gids) {
    const frTitle = await fetchTitle(gid, 'fr');
    if (/\b(Vervangingsluchtfilter|Inlaatkanaal|Oliekoeler|Uitlaat|Zwart|Blauw)\b/i.test(frTitle)) {
      dutchInTitles.push(frTitle.slice(0, 70));
    }
    if (/turbo entree|turbo entrée/i.test(frTitle)) badFrTerms.push(frTitle.slice(0, 70));
  }
  const frClean = dutchInTitles.length === 0 && badFrTerms.length === 0;
  report.push({
    id: 'P1-3',
    issue: 'FR Dutch leaks + punctuation in titles',
    ...rate(frClean, frClean ? 8 : dutchInTitles.length <= 2 ? 6 : 3),
    detail: frClean
      ? 'No Dutch fragments in FR titles (50 products scanned)'
      : `${dutchInTitles.length} Dutch hits, ${badFrTerms.length} bad turbo terms`,
    evidence: { dutchSamples: dutchInTitles.slice(0, 3), turboSamples: badFrTerms.slice(0, 3) },
  });

  // 4. Glossary / terminology
  const termTests = [
    { src: 'Forge Turbo Inlet Kit Toyota', loc: 'fr', bad: /turbo entree|turbo entrée/i, good: /Turbo Inlet/i },
    { src: 'Forge Intercooler Kit Toyota', loc: 'de', bad: /Intercooler/i, good: /Ladeluftkühler/i },
    { src: 'Forge Intercooler Kit Toyota', loc: 'fr', bad: /échangeur|refroidisseur/i, good: /Intercooler/i },
  ];
  const termResults = termTests.map((t) => {
    const out = applyGlossaryPost(t.src, toDeepLTarget(t.loc), glossary);
    const pass = t.good.test(out) && !t.bad.test(out);
    return { ...t, out, pass };
  });
  const termsOk = termResults.every((t) => t.pass);
  report.push({
    id: 'P1-4',
    issue: 'Locked glossary (Turbo Inlet, Intercooler, etc.)',
    ...rate(termsOk, termsOk ? 8 : 5),
    detail: termsOk ? 'Glossary rules apply correctly in post-process' : 'Some term rules fail on sample strings',
    evidence: termResults,
  });

  // 5. shop_name theme key (JSON + header liquid fallback for FR/IT key-cap locales)
  const shopKeys = {};
  for (const loc of ['nl', 'fr', 'it', 'de', 'es']) {
    const asset = loc === 'en' ? 'locales/en.default.json' : `locales/${loc}.json`;
    shopKeys[loc] = await fetchThemeLocaleKey(asset, 'header.general.shop_name');
  }
  const theme = await getMainTheme();
  const themeId = theme.id.split('/').pop();
  const headerRes = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': 'sections/header.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 30000,
  });
  const headerLiquid = headerRes.data?.asset?.value || '';
  const hasLiquidFallback = /jt_shop_name/.test(headerLiquid) && /JT Products/.test(headerLiquid);
  const jsonOk = ['nl', 'de', 'es'].every(
    (loc) => shopKeys[loc] && shopKeys[loc] !== '' && !String(shopKeys[loc]).includes('Translation missing')
  );
  const frItCovered = hasLiquidFallback || ['fr', 'it'].every((loc) => shopKeys[loc] === 'JT Products');
  const shopOk = jsonOk && frItCovered;
  report.push({
    id: 'P2-5',
    issue: 'header.general.shop_name theme key (NL/FR/IT)',
    ...rate(shopOk, shopOk ? 9 : hasLiquidFallback ? 8 : 4),
    detail: shopOk
      ? 'JT Products in locale JSON + header fallback for capped locales'
      : hasLiquidFallback
        ? 'Header liquid fallback active; FR/IT JSON at Shopify key cap'
        : 'Missing or broken in some locales',
    evidence: { ...shopKeys, headerFallback: hasLiquidFallback },
  });

  // 6. Set contents IT/ES flagship
  const setIt = auditSetContents(await fetchBody(FLAGSHIP, 'it'));
  const setEs = auditSetContents(await fetchBody(FLAGSHIP, 'es'));
  const setOk = setIt.hasInstall && setEs.hasInstall && setIt.items >= 3 && setEs.items >= 3;
  report.push({
    id: 'P2-6',
    issue: 'Set-contents install line (IT + ES)',
    ...rate(setOk, setOk ? 9 : 5),
    detail: setOk ? 'IT and ES have install-instructions bullet' : `IT install=${setIt.hasInstall} items=${setIt.items}, ES install=${setEs.hasInstall} items=${setEs.items}`,
    evidence: { it: setIt, es: setEs },
  });

  // Delivery dates theme
  const shipping = await fetchShippingSnippet();
  const months = { es: shipping.includes('06:junio'), fr: shipping.includes('06:juin'), de: shipping.includes('06:Juni'), nl: shipping.includes('06:juni'), it: shipping.includes('06:giugno') };
  const datesOk = Object.values(months).every(Boolean);
  report.push({
    id: 'BONUS-dates',
    issue: 'Delivery date month localization',
    ...rate(datesOk, datesOk ? 10 : 6),
    detail: datesOk ? 'Theme shipping calculator has localized June labels' : 'Some locale month maps missing',
    evidence: months,
  });

  // Related product FR title (Polo)
  const poloFr = await fetchTitle(POLO_COLOR, 'fr');
  const poloFrOk = /Admission d'air par induction en carbone Forge pour Volkswagen/i.test(poloFr);
  report.push({
    id: 'EARLIER-related-fr',
    issue: 'Related product FR title (Polo intake)',
    ...rate(poloFrOk, poloFrOk ? 9 : 3),
    detail: poloFrOk ? poloFr : `Got: ${poloFr || '(missing)'}`,
  });

  // ES body grammar flagship
  const esBody = await fetchBody(FLAGSHIP, 'es');
  const esGrammarOk = !/\buna tubo\b/i.test(esBody);
  const esDupFilter = (esBody.match(/Filtro de aire lavable y reutilizable/gi) || []).length <= 1;
  const esBrokenLi = !/<li>[^<]+<li>/i.test(esBody);
  const esBodyOk = esGrammarOk && esDupFilter && esBrokenLi;
  report.push({
    id: 'EARLIER-es-body',
    issue: 'ES product body (una tubo, duplicate filter, broken li)',
    ...rate(esBodyOk, esBodyOk ? 8 : esGrammarOk && esDupFilter ? 6 : 4),
    detail: `grammar=${esGrammarOk} dupFilter=${esDupFilter} brokenLi=${!esBrokenLi ? 'yes' : 'no'}`,
  });

  // Tuning advice theme string
  const esTuning = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id: (await getMainTheme()).id, l: 'es' }
  );
  const tuningVal = esTuning.translatableResource?.translations?.find((t) =>
    t.key.includes('item_eVdMiY')
  )?.value;
  const tuningOk = tuningVal && /Asesoramiento de tuning/i.test(tuningVal) && !/preparación/i.test(tuningVal);
  report.push({
    id: 'EARLIER-es-tuning',
    issue: 'ES tuning advice string (not preparación)',
    ...rate(!!tuningOk, tuningOk ? 9 : 5),
    detail: tuningVal ? tuningVal.replace(/<[^>]+>/g, '').slice(0, 80) : '(not found)',
  });

  // Structural repair still needed?
  let bodiesNeedingRepair = 0;
  for (const gid of gids.slice(0, 20)) {
    for (const loc of LOCALES) {
      const body = await fetchBody(gid, loc);
      if (!body) continue;
      const repaired = applyProductBodyStructuralRepair(body, loc);
      if (repaired.trim() !== body.trim()) bodiesNeedingRepair += 1;
    }
  }
  report.push({
    id: 'META-body-drift',
    issue: 'Products still needing body repair (sample 20×5)',
    ...rate(bodiesNeedingRepair === 0, bodiesNeedingRepair === 0 ? 10 : bodiesNeedingRepair <= 3 ? 7 : 4),
    detail: `${bodiesNeedingRepair} locale bodies would still change if repair re-run`,
  });

  // NOT FIXABLE VIA API
  const productJsonRes = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': 'templates/product.json' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 30000,
  });
  const productTpl = JSON.parse(productJsonRes.data?.asset?.value || '{}');
  const mainBlocks = productTpl?.sections?.main?.blocks || {};
  const blockOrder = productTpl?.sections?.main?.block_order || [];
  const hasApplicability = blockOrder.includes('content_VdNWWq');
  const hasReturnBody = blockOrder.includes('content_NXhqmi');
  const returnHasContent = Boolean(
    String(mainBlocks.content_NXhqmi?.settings?.content || '').replace(/<[^>]+>/g, '').trim()
  );
  const accordionsOk = hasApplicability && hasReturnBody && returnHasContent;
  report.push({
    id: 'OPEN-theme-dup',
    issue: 'Product page accordions (applicability + returns)',
    ...rate(accordionsOk, accordionsOk ? 9 : 4),
    detail: accordionsOk
      ? 'Toepasbaarheid + return-policy accordions present'
      : `applicability=${hasApplicability} returnBody=${hasReturnBody} returnContent=${returnHasContent}`,
    evidence: { hasApplicability, hasReturnBody, returnHasContent },
  });

  report.push({
    id: 'OPEN-cart0',
    issue: 'Cart0 literal in mobile header (if still visible)',
    fixed: 'unknown',
    quality: 5,
    score: 5,
    detail: 'Liquid patches applied; verify on live mobile — API cannot confirm storefront render',
  });

  // Print report
  console.log('\n=== QA AUDIT REPORT ===\n');
  let total = 0;
  let count = 0;
  for (const r of report) {
    const status =
      r.fixed === true ? 'FIXED' : r.fixed === false ? 'OPEN' : r.fixed === 'unknown' ? 'PARTIAL' : 'OPEN';
    const bar = r.score ? '★'.repeat(Math.round(r.score / 2)) + '☆'.repeat(5 - Math.round(r.score / 2)) : '☆☆☆☆☆';
    console.log(`${r.id} [${status}] ${bar} ${r.score}/10`);
    console.log(`  ${r.issue}`);
    console.log(`  ${r.detail}\n`);
    if (typeof r.score === 'number' && r.score > 0) {
      total += r.score;
      count += 1;
    }
  }
  const avg = count ? (total / count).toFixed(1) : 0;
  console.log(`---\nAverage score (fixed items): ${avg}/10`);
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
