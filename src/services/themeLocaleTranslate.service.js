const { config } = require('../config');
const {
  fetchThemeLocaleAsset,
  putThemeLocaleAsset,
  flattenStringLeaves,
  buildThemeLocaleAssetMap,
} = require('./themeLocale.service');
const { translateBatch, toDeepLTarget } = require('./deepl.service');
const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');
const { logger } = require('../utils/logger');

const BATCH = 40;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Translate string map values from NL source JSON into per-locale theme JSON assets.
 * @param {string} themeGid
 * @param {string} sourceAssetKey e.g. locales/nl.json
 * @param {Record<string, string>} [assetKeyByLocale] optional map locale -> asset key; default locales/{locale}.json
 */
async function translateThemeLocaleAssets(themeGid, sourceAssetKey, assetKeyByLocale) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const sourceJson = await fetchThemeLocaleAsset(themeGid, sourceAssetKey);
  const flat = flattenStringLeaves(sourceJson);
  const keys = Object.keys(flat);
  if (!keys.length) {
    logger.info('theme_locale_skip_empty', { themeGid, sourceAssetKey });
    return { skipped: true };
  }

  const targets = config.locales.targets.map((l) => String(l).toLowerCase().split('-')[0]);
  const src = String(config.locales.source).toLowerCase().split('-')[0];
  const defaultAssetMap = await buildThemeLocaleAssetMap(themeGid, targets);

  for (const locale of targets) {
    if (locale === src) continue;
    const assetKey =
      assetKeyByLocale?.[locale] ||
      assetKeyByLocale?.[locale.toUpperCase()] ||
      defaultAssetMap[locale] ||
      `locales/${locale}.json`;

    /** @type {Record<string, string>} */
    const outFlat = {};
    const entries = keys.map((k) => ({ k, t: flat[k] }));

    for (const part of chunk(entries, BATCH)) {
      const translated = await translateBatch(part.map((p) => p.t), locale, {
        html: false,
        sourceLocale: src,
      });
      const deeplTarget = toDeepLTarget(locale);
      for (let i = 0; i < part.length; i++) {
        let val = translated[i] ?? part[i].t;
        val = applyGlossaryPost(val, deeplTarget, glossaryMap);
        outFlat[part[i].k] = val;
      }
    }

    const put = await putThemeLocaleAsset(themeGid, assetKey, outFlat);
    if (put.skipped) {
      const jtOnly = Object.fromEntries(
        Object.entries(outFlat).filter(([k]) => k.startsWith('jt.') || k.includes('product.'))
      );
      if (Object.keys(jtOnly).length) {
        const partial = await putThemeLocaleAsset(themeGid, assetKey, jtOnly);
        if (partial.ok) {
          logger.warn('theme_locale_partial_upload', {
            locale,
            assetKey,
            keys: Object.keys(jtOnly).length,
            reason: 'too_many_keys_full_file',
          });
        } else {
          logger.warn('theme_locale_skip_upload', {
            locale,
            assetKey,
            reason: 'too_many_keys',
            hint: 'Use Shopify Translations API / jt-locale fallback for this locale',
          });
        }
      } else {
        logger.warn('theme_locale_skip_upload', { locale, assetKey, reason: 'too_many_keys' });
      }
    }
  }

  return { themeGid, keys: keys.length };
}

module.exports = { translateThemeLocaleAssets };
