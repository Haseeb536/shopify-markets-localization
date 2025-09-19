/**
 * Translate theme UI copy without modifying .liquid layout files.
 *
 * Safe (words only):
 *   - Shopify Translations API on theme resource
 *   - locales/*.json string updates (es.json, etc.)
 *   - Navigation / menu text via Translations API
 *
 * Skipped (can break layout):
 *   - snippet/section Liquid patches
 *   - jt-locale-string.liquid deploy
 *   - header cart Liquid rewrites
 */
const { config } = require('../config');
const { getMainTheme } = require('./shopify.service');
const { SNIPPET_STRINGS } = require('./themeSnippetStrings.service');
const { LOCALE_STRINGS } = require('./themeContactPatch.service');
const { translateAndPublishLocaleKeys } = require('./themeLocaleKeys.service');
const { translateResource } = require('./translation.service');
const { translateThemeLocaleAssets } = require('./themeLocaleTranslate.service');
const {
  translateProductPageSchemaKeys,
  applyEnglishLocaleCopyFixes,
} = require('./themeLocaleSchema.service');
const { fixThemeProductStrings } = require('./fixThemeProductStrings.service');
const {
  applyThemeNavTranslations,
  applyThemeNavLocaleKeys,
} = require('./themeStorefrontNav.service');
const { logger } = require('../utils/logger');

const PRODUCT_PAGE_KEY_PREFIXES = [
  'section.product.json.',
  'section.sections/footer-group.json.',
  'jt.contact.',
  'jt.footer.',
  'jt.product.',
];

function matchesProductPageThemeKey(key) {
  return PRODUCT_PAGE_KEY_PREFIXES.some((p) => String(key).startsWith(p));
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.themeLocaleFiles] translate locales/nl.json → locales/es.json etc.
 * @param {boolean} [opts.jtKeys] seed jt.* keys + DeepL via Translations API
 * @param {boolean} [opts.menus] translate online store menus
 */
async function syncThemeTextWithoutLiquid(opts = {}) {
  const theme = await getMainTheme();
  if (!theme?.id) throw new Error('No MAIN theme');

  const themeLocaleFiles = opts.themeLocaleFiles !== false;
  const jtKeys = opts.jtKeys !== false;
  const menus = opts.menus !== false;

  /** @type {Record<string, unknown>} */
  const result = { themeGid: theme.id, mode: 'theme-text-only' };

  if (themeLocaleFiles) {
    // eslint-disable-next-line no-console
    console.log('Theme locale JSON (locales/es.json, …) — no Liquid changes…');
    result.themeLocale = await translateThemeLocaleAssets(
      theme.id,
      process.env.THEME_SOURCE_ASSET || 'locales/nl.json',
      opts.assetKeyByLocale
    );
  }

  if (jtKeys) {
    const mergedKeys = { ...SNIPPET_STRINGS, ...LOCALE_STRINGS };
    result.jtLocaleKeys = await translateAndPublishLocaleKeys(theme.id, mergedKeys);
  }

  try {
    result.themeTranslationsApi = await translateResource(
      theme.id,
      { topic: 'theme-text-only-api' },
      matchesProductPageThemeKey
    );
  } catch (e) {
    logger.warn('theme_text_only_api_partial', { error: e.message });
    result.themeTranslationsApi = { error: e.message };
  }

  try {
    result.navTranslations = await applyThemeNavTranslations(theme.id);
    result.navLocaleKeys = await applyThemeNavLocaleKeys(theme.id);
  } catch (e) {
    logger.warn('theme_nav_text_only_failed', { error: e.message });
    result.navError = e.message;
  }

  try {
    result.productPageStrings = await fixThemeProductStrings();
    result.schemaKeys = await translateProductPageSchemaKeys(theme.id);
    if (config.locales.targets.map((l) => l.toLowerCase()).includes('en')) {
      result.enCopyFixes = await applyEnglishLocaleCopyFixes(theme.id);
    }
  } catch (e) {
    logger.warn('theme_product_strings_failed', { error: e.message });
    result.productStringsError = e.message;
  }

  if (menus) {
    try {
      const { translateStoreMenus } = require('./translateStoreMenus.service');
      result.menus = await translateStoreMenus();
    } catch (e) {
      logger.warn('theme_menus_text_only_failed', { error: e.message });
      result.menus = { error: e.message };
    }
  }

  return result;
}

module.exports = { syncThemeTextWithoutLiquid, matchesProductPageThemeKey };
