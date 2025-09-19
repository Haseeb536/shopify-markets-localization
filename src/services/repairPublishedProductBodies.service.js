const { config } = require('../config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { applyProductBodyStructuralRepair } = require('../utils/productHtml');
const { applyGlossaryPost, loadGlossary } = require('../utils/glossary');
const { applyGrammarQaPost } = require('../utils/grammarQa');
const { toDeepLTarget } = require('./deepl.service');
const { logger } = require('../utils/logger');

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

const TRANSLATIONS_QUERY = `
  query($id: ID!, $loc: String!) {
    translatableResource(resourceId: $id) {
      translatableContent { key digest locale }
      translations(locale: $loc) { key value }
    }
  }
`;

/**
 * Apply glossary + structural HTML repair to published body_html (no DeepL).
 * @param {string[]} productGids
 */
async function repairPublishedProductBodies(productGids) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const src = norm(config.locales.source);
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l) && l !== src);

  let updated = 0;
  let unchanged = 0;

  for (const gid of productGids) {
    let digest;
    try {
      const base = await fetchTranslatableResource(gid);
      digest = (base.translatableContent || []).find((c) => c.key === 'body_html')?.digest;
      if (!digest) continue;
    } catch (e) {
      logger.warn('repair_body_fetch_failed', { gid, error: e.message });
      continue;
    }

    for (const locale of targets) {
      try {
        const data = await graphql(TRANSLATIONS_QUERY, { id: gid, loc: locale });
        const body = data.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value;
        if (!body?.trim()) continue;

        let value = applyProductBodyStructuralRepair(body, locale);
        value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
        value = applyGrammarQaPost(value, locale);

        if (value.trim() === body.trim()) {
          unchanged += 1;
          continue;
        }

        await registerTranslationsReliable(
          gid,
          [{ locale, key: 'body_html', value, translatableContentDigest: digest }],
          { batchSize: 1 }
        );
        updated += 1;
      } catch (e) {
        logger.warn('repair_body_locale_failed', { gid, locale, error: e.message });
      }
    }
  }

  return { products: productGids.length, locales: targets.length, updated, unchanged };
}

module.exports = { repairPublishedProductBodies };
