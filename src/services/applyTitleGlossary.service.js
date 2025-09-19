const { config } = require('../config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { applyGlossaryPost, loadGlossary } = require('../utils/glossary');
const { toDeepLTarget } = require('./deepl.service');
const { logger } = require('../utils/logger');

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

const TITLE_QUERY = `
  query($id: ID!, $loc: String!) {
    translatableResource(resourceId: $id) {
      translations(locale: $loc) { key value }
    }
  }
`;

/**
 * Apply motorsport glossary to existing product titles (Inlaatkanaal, Oliekoeler, Intake, …).
 * @param {string[]} productGids
 */
async function applyGlossaryToProductTitles(productGids) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l) && l !== norm(config.locales.source));

  let updated = 0;

  for (const gid of productGids) {
    let digest;
    try {
      const base = await fetchTranslatableResource(gid);
      digest = (base.translatableContent || []).find((c) => c.key === 'title')?.digest;
      if (!digest) continue;
    } catch (e) {
      continue;
    }

    for (const locale of targets) {
      try {
        const data = await graphql(TITLE_QUERY, { id: gid, loc: locale });
        const title = data.translatableResource?.translations?.find((t) => t.key === 'title')?.value;
        if (!title?.trim()) continue;

        const value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
        if (value.trim() === title.trim()) continue;

        await registerTranslationsReliable(
          gid,
          [{ locale, key: 'title', value, translatableContentDigest: digest }],
          { batchSize: 1 }
        );
        updated += 1;
      } catch (e) {
        logger.warn('title_glossary_failed', { gid, locale, error: e.message });
      }
    }
  }

  return { products: productGids.length, updated };
}

module.exports = { applyGlossaryToProductTitles };
