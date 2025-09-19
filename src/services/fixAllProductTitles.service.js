const { config } = require('../config');
const {
  graphql,
  listAllProductGids,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');
const {
  applyProductTitleLocalePost,
  fixKitWordOrderInTitle,
  fixDutchEnInTitle,
  fixFrenchTitlePolish,
  fixTitleTerminologyPost,
  fixSeoTitlePost,
  seoTitleNeedsFix,
  seoTitleNeedsFullReprocess,
  titleHasTerminologyBug,
  needsTitleReprocessing,
} = require('../utils/productTitle');
const { toDeepLTarget } = require('./deepl.service');
const { logger } = require('../utils/logger');

const DUTCH_IN_TITLE =
  /\b(Inlaatkanaal|inlaatkanaal|Oliekoeler|oliekoeler|Interkoeler|interkoeler|Luchtinlaat|Uitlaat|uitlaat|Catback uitlaat|resonator delete buis|Buis|Verstelbare|Siliconen|slangenset|actuator|Vervangings|Vervangingsfilter|achterste|onderste|draagarmen|Schakelpook)\b/i;

const FRENCH_LEAK_IN_TITLE = /\b(Radiateur|soupape de recirculation)\b/i;
const TRAILING_KIT = /\s+Kit\s+Forge/i;

function titleNeedsRepair(title, locale, nlTitle) {
  const loc = norm(locale);
  if (DUTCH_IN_TITLE.test(title)) return true;
  if (loc !== 'fr' && FRENCH_LEAK_IN_TITLE.test(title)) return true;
  if (['fr', 'it', 'es'].includes(loc) && TRAILING_KIT.test(title)) return true;
  if (/\s+en\s+(?=[A-Z0-9])/i.test(title) && ['de', 'en', 'fr', 'it', 'es'].includes(loc)) return true;
  if (/\bInduction Intake\b/i.test(title) && loc !== 'en') return true;
  if (loc === 'fr' && (/\bIntake\b/.test(title) || /^fibre de carbone/i.test(title))) return true;
  if (titleHasTerminologyBug(title, locale, nlTitle)) return true;
  if (seoTitleNeedsFix(title, locale, nlTitle)) return true;
  return false;
}

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * Apply glossary to NL source + every locale title (fixes recommendations showing Dutch fragments).
 * @param {string[]} [productGids]
 */
async function fixAllProductTitlesWithGlossary(productGids) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const src = norm(config.locales.source);
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l) && l !== src);

  const gids = productGids?.length ? productGids : await listAllProductGids();
  let updated = 0;
  let scanned = 0;

  for (const gid of gids) {
    scanned += 1;
    let tr;
    let titleRow;
    try {
      tr = await fetchTranslatableResource(gid);
      titleRow = (tr.translatableContent || []).find((c) => c.key === 'title' && c.digest);
      if (!titleRow) continue;
    } catch {
      continue;
    }

    const nlTitle =
      (tr.translatableContent || []).find(
        (c) => c.key === 'title' && norm(c.locale) === src
      )?.value || titleRow.value;

    for (const locale of targets) {
      try {
        const data = await graphql(
          `query($id: ID!, $l: String!) {
            translatableResource(resourceId: $id) {
              translations(locale: $l) { key value }
            }
          }`,
          { id: gid, l: locale }
        );
        let title =
          data.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
        const terminologyOnly =
          titleHasTerminologyBug(title, locale, nlTitle) ||
          (seoTitleNeedsFix(title, locale, nlTitle) && !seoTitleNeedsFullReprocess(title, locale, nlTitle));
        const needsRepair = titleNeedsRepair(title, locale, nlTitle);
        if (
          (needsRepair && !terminologyOnly) ||
          seoTitleNeedsFullReprocess(title, locale, nlTitle) ||
          needsTitleReprocessing(title, locale, nlTitle)
        ) {
          title = nlTitle;
        }
        if (!title?.trim()) continue;

        const existingLocaleTitle = (
          data.translatableResource?.translations?.find((t) => t.key === 'title')?.value || ''
        ).trim();

        let value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
        value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
        value = fixDutchEnInTitle(value, locale);
        value = fixKitWordOrderInTitle(value, locale);
        value = applyProductTitleLocalePost(value, locale);
        value = fixFrenchTitlePolish(value, locale);
        value = fixTitleTerminologyPost(value, locale, nlTitle);
        value = fixSeoTitlePost(value, locale, nlTitle);
        value = fixKitWordOrderInTitle(value, locale);
        if (!value?.trim()) continue;
        if (existingLocaleTitle && value.trim() === existingLocaleTitle.trim()) continue;

        await registerTranslationsReliable(
          gid,
          [
            {
              locale,
              key: 'title',
              value,
              translatableContentDigest: titleRow.digest,
            },
          ],
          { batchSize: 1 }
        );
        updated += 1;
      } catch (e) {
        logger.warn('fix_title_locale_failed', { gid, locale, error: e.message });
      }
    }
  }

  return { scanned, updated, targets: targets.length };
}

/**
 * Products whose titles still contain Dutch automotive terms (for reporting).
 */
async function findProductsWithDutchTitleFragments() {
  const gids = await listAllProductGids();
  const hits = [];
  for (const gid of gids) {
    const tr = await fetchTranslatableResource(gid);
    const nlTitle =
      (tr.translatableContent || []).find((c) => c.key === 'title')?.value || '';
    if (DUTCH_IN_TITLE.test(nlTitle)) {
      hits.push({ gid, title: nlTitle, where: 'source' });
      continue;
    }
    for (const row of tr.translations || []) {
      if (row.key === 'title' && DUTCH_IN_TITLE.test(row.value || '')) {
        hits.push({ gid, title: row.value, where: row.locale });
        break;
      }
    }
  }
  return hits;
}

module.exports = { fixAllProductTitlesWithGlossary, findProductsWithDutchTitleFragments };
