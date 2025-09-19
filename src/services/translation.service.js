const { config } = require('../config');
const {
  fetchTranslatableResource,
  registerTranslations,
  getShopPrimaryLocale,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { translateContentItems, toDeepLTarget, translateBatch } = require('./deepl.service');
const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');
const {
  extractJsonLdFromHtml,
  finalizeProductBodyHtml,
  isProductBodyKey,
  translateProductBodyHtml,
} = require('../utils/productHtml');
const { logger } = require('../utils/logger');

const DEEPL_BATCH = 40;
const SHOPIFY_REGISTER_BATCH = 20;

/** Keys we should not send to DeepL / Shopify translations (handles collide across locales). */
const DEFAULT_SKIP_KEYS = new Set(['handle']);

function shouldSkipTranslatableKey(key, value) {
  const k = String(key || '').toLowerCase();
  if (DEFAULT_SKIP_KEYS.has(k)) return true;
  // Shopify product type is often a manual taxonomy; MT produces garbage (e.g. "Moshin Automatisierung")
  if (k === 'product_type') return true;
  // Theme section settings: translating URLs breaks Shopify validation
  if (/link_url|button_link|cart_empty_button_link|\.link$/.test(k)) {
    const v = String(value || '').trim();
    if (/^https?:\/\//i.test(v) || v.startsWith('/')) return true;
  }
  return false;
}

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * Pick translatable rows for the source language.
 * Tries SOURCE_LOCALE, then shop primary, then best available non-target locale.
 * @param {Array<{key:string,value:string,digest:string,locale:string}>} contents
 * @param {string} shopPrimaryLocale
 */
function resolveSourceContents(contents, shopPrimaryLocale) {
  const configured = normalizeLocale(config.locales.source);
  const primary = normalizeLocale(shopPrimaryLocale);
  const targets = new Set(config.locales.targets.map(normalizeLocale));

  const withValue = (contents || []).filter((c) => c.value && String(c.value).trim());

  function pickForLocale(loc) {
    return withValue.filter((c) => normalizeLocale(c.locale) === loc);
  }

  let items = pickForLocale(configured);
  let resolvedLocale = configured;

  if (!items.length && primary && primary !== configured) {
    logger.warn('translation_source_locale_fallback', {
      configured,
      used: primary,
      reason: 'shop_primary_locale',
      hint: 'Set Shopify primary language to match SOURCE_LOCALE in .env',
    });
    items = pickForLocale(primary);
    resolvedLocale = primary;
  }

  if (!items.length) {
    const byLocale = new Map();
    for (const c of withValue) {
      const loc = normalizeLocale(c.locale) || 'unknown';
      if (!byLocale.has(loc)) byLocale.set(loc, []);
      byLocale.get(loc).push(c);
    }
    const available = [...byLocale.keys()];
    logger.info('translation_locale_discovery', { available, configured, primary });

    for (const loc of [configured, primary, ...available]) {
      if (!loc || targets.has(loc)) continue;
      const group = byLocale.get(loc);
      if (group?.length) {
        items = group;
        resolvedLocale = loc;
        break;
      }
    }

    if (!items.length && available.length) {
      const loc = available.sort((a, b) => byLocale.get(b).length - byLocale.get(a).length)[0];
      items = byLocale.get(loc);
      resolvedLocale = loc;
      logger.warn('translation_source_locale_fallback', {
        configured,
        used: loc,
        reason: 'largest_locale_group',
      });
    }
  }

  return { items, resolvedLocale };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * @param {string} resourceGid
 * @param {Record<string, unknown>} [meta]
 * @param {(key: string) => boolean} [keyFilter]
 * @param {string[]} [targetLocalesOverride] e.g. ['en'] when DeepL quota is limited
 */
async function translateResource(resourceGid, meta = {}, keyFilter = null, targetLocalesOverride = null) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(resourceGid);
  const shopPrimary = await getShopPrimaryLocale();
  let { items, resolvedLocale } = resolveSourceContents(
    tr.translatableContent || [],
    shopPrimary
  );

  if (keyFilter) {
    items = items.filter((c) => keyFilter(c.key));
  }

  const beforeSkip = items.length;
  items = items.filter((c) => !shouldSkipTranslatableKey(c.key, c.value));
  if (beforeSkip > items.length) {
    logger.info('translation_skipped_keys', {
      resourceGid,
      skipped: beforeSkip - items.length,
      keys: ['handle', 'url_settings', 'product_type'],
    });
  }

  if (!items.length) {
    const locales = [...new Set((tr.translatableContent || []).map((c) => c.locale))];
    logger.info('translation_skip_no_source_content', {
      resourceGid,
      configuredSource: config.locales.source,
      shopPrimary,
      localesSeen: locales,
      ...meta,
    });
    return { skipped: true, reason: 'no_source_content' };
  }

  if (resolvedLocale !== normalizeLocale(config.locales.source)) {
    logger.info('translation_using_resolved_source_locale', {
      resourceGid,
      configured: config.locales.source,
      resolved: resolvedLocale,
      shopPrimary,
    });
  }

  const publishedOnShop = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const targetList = targetLocalesOverride || config.locales.targets;
  const targets = targetList
    .map(normalizeLocale)
    .filter((loc) => publishedOnShop.has(loc));

  if (!targets.length) {
    logger.warn('translation_skip_no_published_targets', {
      resourceGid,
      configuredTargets: config.locales.targets,
      publishedOnShop: [...publishedOnShop],
      hint: 'Add languages in Shopify Admin → Settings → Languages',
    });
    return {
      skipped: true,
      reason: 'no_published_target_locales',
      sourceLocale: resolvedLocale,
      publishedOnShop: [...publishedOnShop],
    };
  }

  const results = [];
  const pairs = items.map((c) => {
    let text = c.value;
    let jsonLdBlocks = [];
    if (isProductBodyKey(c.key)) {
      const split = extractJsonLdFromHtml(text);
      text = split.html;
      jsonLdBlocks = split.jsonLdBlocks;
    }
    return { key: c.key, text, digest: c.digest, jsonLdBlocks };
  });

  for (const targetLocale of targets) {
    if (targetLocale === resolvedLocale) continue;

    const translatedPieces = [];

    const bodyPairs = pairs.filter((p) => isProductBodyKey(p.key));
    const plainPairs = pairs.filter((p) => !isProductBodyKey(p.key));

    for (const part of chunk(plainPairs, DEEPL_BATCH)) {
      const translated = await translateContentItems(
        part.map((p) => ({ key: p.key, text: p.text })),
        targetLocale,
        resolvedLocale
      );
      const deeplTarget = toDeepLTarget(targetLocale);
      for (let i = 0; i < part.length; i++) {
        const value = applyGlossaryPost(translated[i] ?? part[i].text, deeplTarget, glossaryMap);
        translatedPieces.push({
          locale: targetLocale,
          key: part[i].key,
          value,
          translatableContentDigest: part[i].digest,
        });
      }
    }

    for (const part of bodyPairs) {
      let value;
      try {
        value = await translateProductBodyHtml(
          part.text,
          targetLocale,
          resolvedLocale,
          glossaryMap
        );
      } catch (e) {
        logger.warn('product_body_chunked_translate_fallback', {
          resourceGid,
          locale: targetLocale,
          error: e.message,
        });
        const [fallback] = await translateBatch([part.text], targetLocale, {
          html: true,
          sourceLocale: resolvedLocale,
        });
        const deeplTarget = toDeepLTarget(targetLocale);
        value = applyGlossaryPost(fallback ?? part.text, deeplTarget, glossaryMap);
        value = await finalizeProductBodyHtml(value, targetLocale, {
          jsonLdBlocks: part.jsonLdBlocks,
          translateTexts: (texts) =>
            translateBatch(texts, targetLocale, {
              sourceLocale: resolvedLocale,
              html: false,
            }),
        });
      }
      translatedPieces.push({
        locale: targetLocale,
        key: part.key,
        value,
        translatableContentDigest: part.digest,
      });
    }

    const registerBatchSize =
      String(resourceGid).includes('OnlineStoreTheme') ? 10 : SHOPIFY_REGISTER_BATCH;
    for (const regChunk of chunk(translatedPieces, registerBatchSize)) {
      const reg = await registerTranslations(resourceGid, regChunk);
      results.push({ locale: targetLocale, register: reg });
    }
  }

  return { resourceGid, sourceLocale: resolvedLocale, results };
}

/** @deprecated use resolveSourceContents */
function filterSourceContents(contents) {
  return resolveSourceContents(contents, config.locales.source).items;
}

module.exports = {
  translateResource,
  resolveSourceContents,
  filterSourceContents,
};
