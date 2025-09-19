const { config } = require('../config');

const { translateBatch, toDeepLTarget } = require('./deepl.service');

const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');

const { putThemeLocaleAsset, buildThemeLocaleAssetMap } = require('./themeLocale.service');

const {

  fetchTranslatableResource,

  registerTranslationsReliable,

  fetchTranslationsMap,

  getShopPublishedLocaleCodes,

} = require('./shopify.service');

const { logger } = require('../utils/logger');



function normalizeLocale(l) {

  return String(l || '').toLowerCase().split('-')[0];

}



/**

 * Publish custom theme strings: NL in locale JSON; targets via Translations API

 * with file fallback when the theme hits Shopify's translation key cap (e.g. IT).

 *

 * @param {string} themeGid

 * @param {Record<string, string>} flatKeys dot-path keys → Dutch source text

 * @param {string} [sourceAssetKey]

 */

async function translateAndPublishLocaleKeys(themeGid, flatKeys, sourceAssetKey) {

  const sourceAsset = sourceAssetKey || process.env.THEME_SOURCE_ASSET || 'locales/nl.json';

  const src = normalizeLocale(config.locales.source);

  const glossaryMap = loadGlossary(config.paths.glossary);



  const keys = Object.keys(flatKeys).filter((k) => flatKeys[k]?.trim());

  if (!keys.length) {

    return { skipped: true, reason: 'no_keys' };

  }



  const sourceOnly = {};

  for (const k of keys) sourceOnly[k] = flatKeys[k];

  await putThemeLocaleAsset(themeGid, sourceAsset, sourceOnly);



  const tr = await fetchTranslatableResource(themeGid);

  const nlRows = (tr.translatableContent || []).filter(

    (c) => normalizeLocale(c.locale) === src && keys.includes(c.key)

  );

  const digestByKey = new Map(nlRows.map((c) => [c.key, c.digest]));



  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));

  const targets = config.locales.targets

    .map(normalizeLocale)

    .filter((loc) => loc !== src && published.has(loc));



  const texts = keys.map((k) => flatKeys[k]);

  const assetMap = await buildThemeLocaleAssetMap(themeGid, targets);

  /** @type {Record<string, string>} */

  const byLocale = {};

  const fileFallback = [];



  for (const locale of targets) {

    const translated = await translateBatch(texts, locale, {

      sourceLocale: src,

      html: false,

    });

    const deeplTarget = toDeepLTarget(locale);

    const batch = [];

    for (let i = 0; i < keys.length; i++) {

      const key = keys[i];

      const digest = digestByKey.get(key);

      if (!digest) {

        logger.warn('theme_locale_key_no_digest', { key, locale });

        continue;

      }

      const value = applyGlossaryPost(translated[i] ?? texts[i], deeplTarget, glossaryMap);

      batch.push({

        locale,

        key,

        value,

        translatableContentDigest: digest,

      });

    }



    await registerTranslationsReliable(themeGid, batch, { batchSize: 4 });



    const existing = await fetchTranslationsMap(themeGid, locale);

    const missing = keys.filter((k) => !existing.get(k)?.trim());

    if (missing.length) {

      const flat = {};

      for (let i = 0; i < keys.length; i++) {

        if (missing.includes(keys[i])) {

          flat[keys[i]] = applyGlossaryPost(translated[i] ?? texts[i], deeplTarget, glossaryMap);

        }

      }

      const assetKey = assetMap[locale] || `locales/${locale}.json`;

      try {

        await putThemeLocaleAsset(themeGid, assetKey, flat);

        fileFallback.push({ locale, assetKey, keys: missing.length });

        logger.info('theme_locale_keys_file_fallback', { locale, assetKey, keys: missing.length });

      } catch (err) {

        logger.warn('theme_locale_keys_file_fallback_failed', {

          locale,

          message: err.message,

          data: err.response?.data,

        });

      }

    }



    byLocale[locale] = missing.length ? 'file_fallback' : 'translationsRegister';

    logger.info('theme_locale_keys_published', {

      locale,

      keys: batch.length,

      via: byLocale[locale],

      missing: missing.length,

    });

  }



  return {

    sourceAsset,

    keys: keys.length,

    locales: targets,

    assetByLocale: byLocale,

    fileFallback,

  };

}



module.exports = {

  translateAndPublishLocaleKeys,

  normalizeLocale,

};

