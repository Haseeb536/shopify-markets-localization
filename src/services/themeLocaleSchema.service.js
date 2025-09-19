const { config } = require('../config');
const { translateBatch, toDeepLTarget } = require('./deepl.service');
const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');
const {
  fetchThemeLocaleAsset,
  putThemeLocaleAsset,
  buildThemeLocaleAssetMap,
  flattenStringLeaves,
} = require('./themeLocale.service');
const { getShopPublishedLocaleCodes } = require('./shopify.service');
const { logger } = require('../utils/logger');

/** Theme locale JSON keys used on the product page (not in Translations API). */
const PRODUCT_PAGE_SCHEMA_KEYS = [
  'contact.form.name',
  'contact.form.email',
  'home_page.newsletter.submit',
  'home_page.newsletter.input',
  'home_page.newsletter.success',
];

/**
 * DeepL missing keys from locales/nl.json into each target theme locale file.
 * @param {string} themeGid
 * @param {string[]} [keys]
 */
async function translateProductPageSchemaKeys(themeGid, keys = PRODUCT_PAGE_SCHEMA_KEYS) {
  const sourceAsset = process.env.THEME_SOURCE_ASSET || 'locales/nl.json';
  const src = String(config.locales.source).toLowerCase().split('-')[0];
  const glossaryMap = loadGlossary(config.paths.glossary);

  const nlJson = await fetchThemeLocaleAsset(themeGid, sourceAsset);
  const flat = flattenStringLeaves(nlJson);
  const toTranslate = keys.filter((k) => flat[k]?.trim());
  if (!toTranslate.length) return { skipped: true };

  const texts = toTranslate.map((k) => flat[k]);
  const published = new Set((await getShopPublishedLocaleCodes()).map((l) => l.toLowerCase().split('-')[0]));
  const targets = config.locales.targets.filter(
    (l) => published.has(l.toLowerCase().split('-')[0]) && l !== src
  );
  const assetMap = await buildThemeLocaleAssetMap(themeGid, targets);

  for (const locale of targets) {
    const translated = await translateBatch(texts, locale, { sourceLocale: src, html: false });
    const deeplTarget = toDeepLTarget(locale);
    const out = {};
    for (let i = 0; i < toTranslate.length; i++) {
      out[toTranslate[i]] = applyGlossaryPost(translated[i] ?? texts[i], deeplTarget, glossaryMap);
    }
    const assetKey = assetMap[locale] || `locales/${locale}.json`;
    try {
      await putThemeLocaleAsset(themeGid, assetKey, out);
      logger.info('schema_locale_keys_published', { locale, assetKey, keys: toTranslate.length });
    } catch (err) {
      logger.warn('schema_locale_keys_file_failed', {
        locale,
        message: err.message,
        data: err.response?.data,
      });
    }
  }

  return { keys: toTranslate.length, targets };
}

/** Fix awkward DeepL EN copy on the product page (e.g. "e-mail address"). */
const EN_COPY_OVERRIDES = {
  'contact.form.name': 'Name',
  'contact.form.email': 'Email address',
  'home_page.newsletter.input': 'Email address',
  'home_page.newsletter.submit': 'Subscribe',
  'footer.newsletter.input': 'Email address',
  'footer.newsletter.submit': 'Subscribe',
};

/**
 * @param {string} themeGid
 */
async function applyEnglishLocaleCopyFixes(themeGid) {
  const assetMap = await buildThemeLocaleAssetMap(themeGid, ['en']);
  const assetKey = assetMap.en || 'locales/en.default.json';
  await putThemeLocaleAsset(themeGid, assetKey, EN_COPY_OVERRIDES);
  logger.info('en_locale_copy_fixes', { assetKey, keys: Object.keys(EN_COPY_OVERRIDES).length });
  return { assetKey, keys: EN_COPY_OVERRIDES };
}

module.exports = {
  translateProductPageSchemaKeys,
  applyEnglishLocaleCopyFixes,
  PRODUCT_PAGE_SCHEMA_KEYS,
  EN_COPY_OVERRIDES,
};
