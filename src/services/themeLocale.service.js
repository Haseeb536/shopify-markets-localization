const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { logger } = require('../utils/logger');
const { getMainTheme } = require('./shopify.service');

const limiter = new RateLimiter(config.queue.shopifyRps);

/**
 * Fetch a theme locale JSON asset (e.g. locales/nl.json) and return parsed JSON.
 * @param {string} themeGid
 * @param {string} assetKey e.g. locales/nl.default.json or locales/nl.json
 */
async function fetchThemeLocaleAsset(themeGid, assetKey) {
  const id = themeGid.split('/').pop();
  const data = await limiter.schedule(async () => {
    const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
    const res = await axios.get(url, {
      params: { 'asset[key]': assetKey },
      headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
      timeout: 60000,
    });
    return res.data;
  });
  const value = data?.asset?.value;
  if (!value) {
    throw new Error(`Missing theme asset ${assetKey}`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Theme asset ${assetKey} is not valid JSON`);
  }
}

function setDeep(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Shopify rejects locale JSON files that exceed the theme translation key cap.
 * @param {unknown} err
 */
function isTooManyTranslationKeysError(err) {
  /** @type {string[]} */
  const parts = [];
  const assetErr = err?.response?.data?.errors?.asset;
  if (Array.isArray(assetErr)) parts.push(...assetErr.map(String));
  else if (assetErr) parts.push(String(assetErr));
  if (err?.message) parts.push(String(err.message));
  return parts.some((m) => /too many translation keys/i.test(m));
}

/**
 * Upsert theme locale JSON by deep-setting dot-path string leaves.
 * @param {string} themeGid
 * @param {string} assetKey target locale file
 * @param {Record<string, string>} mergedFlat dot path -> translated string
 * @returns {Promise<{ ok: boolean, assetKey: string, keys?: number, skipped?: boolean, reason?: string }>}
 */
async function putThemeLocaleAsset(themeGid, assetKey, mergedFlat) {
  const id = themeGid.split('/').pop();
  let existing = {};
  try {
    existing = await fetchThemeLocaleAsset(themeGid, assetKey);
    existing = JSON.parse(JSON.stringify(existing));
  } catch {
    existing = {};
  }
  for (const [path, val] of Object.entries(mergedFlat)) {
    setDeep(existing, path, val);
  }
  const body = {
    asset: {
      key: assetKey,
      value: JSON.stringify(existing, null, 2),
    },
  };
  try {
    await limiter.schedule(async () => {
      const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
      await axios.put(url, body, {
        headers: {
          'X-Shopify-Access-Token': config.shopify.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });
    });
  } catch (err) {
    if (isTooManyTranslationKeysError(err) && Object.keys(mergedFlat).length > 1) {
      let okCount = 0;
      for (const [path, val] of Object.entries(mergedFlat)) {
        const single = await putThemeLocaleAsset(themeGid, assetKey, { [path]: val });
        if (single.ok) okCount += 1;
      }
      if (okCount > 0) {
        logger.info('theme_locale_asset_updated_per_key', { themeGid, assetKey, keys: okCount });
        return { ok: true, assetKey, keys: okCount, perKey: true };
      }
    }
    if (isTooManyTranslationKeysError(err)) {
      logger.warn('theme_locale_asset_skipped', {
        themeGid,
        assetKey,
        keys: Object.keys(mergedFlat).length,
        reason: 'too_many_translation_keys',
      });
      return {
        ok: false,
        skipped: true,
        reason: 'too_many_translation_keys',
        assetKey,
        keys: Object.keys(mergedFlat).length,
      };
    }
    throw err;
  }
  logger.info('theme_locale_asset_updated', { themeGid, assetKey });
  return { ok: true, assetKey, keys: Object.keys(mergedFlat).length };
}

/**
 * Flatten nested JSON to dot keys for string leaves only.
 * @param {unknown} obj
 * @param {string} [prefix]
 * @returns {Record<string, string>}
 */
function flattenStringLeaves(obj, prefix = '') {
  /** @type {Record<string, string>} */
  const out = {};
  if (obj == null) return out;
  if (typeof obj === 'string') {
    if (prefix) out[prefix] = obj;
    return out;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' && v.trim()) {
      out[p] = v;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenStringLeaves(v, p));
    }
  }
  return out;
}

/**
 * Unflatten dot keys into nested object (shallow merge per segment).
 * @param {Record<string, string>} flat
 */
/**
 * List locale JSON asset keys on a theme (e.g. locales/nl.json).
 * @param {string} themeGid
 * @returns {Promise<string[]>}
 */
async function listThemeLocaleAssetKeys(themeGid) {
  const id = themeGid.split('/').pop();
  const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const res = await axios.get(url, {
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 60000,
  });
  return (res.data.assets || [])
    .map((a) => a.key)
    .filter((k) => k && k.startsWith('locales/') && k.endsWith('.json'));
}

/**
 * Resolve Shopify locale code → theme locale asset path.
 * English themes often use locales/en.default.json instead of locales/en.json.
 * @param {string} locale
 * @param {string[]} availableKeys
 */
function resolveThemeLocaleAssetKey(locale, availableKeys) {
  const base = String(locale).toLowerCase().split('-')[0];
  const candidates = [
    `locales/${locale}.json`,
    `locales/${base}.default.json`,
    `locales/${base}.json`,
  ];
  for (const key of candidates) {
    if (availableKeys.includes(key)) return key;
  }
  return `locales/${base}.json`;
}

/**
 * @param {string} themeGid
 * @param {string[]} targetLocales
 * @returns {Promise<Record<string, string>>}
 */
async function buildThemeLocaleAssetMap(themeGid, targetLocales) {
  const keys = await listThemeLocaleAssetKeys(themeGid);
  /** @type {Record<string, string>} */
  const map = {};
  for (const locale of targetLocales) {
    map[String(locale).toLowerCase().split('-')[0]] = resolveThemeLocaleAssetKey(locale, keys);
  }
  return map;
}

function unflattenLeaves(flat) {
  /** @type {Record<string, unknown>} */
  const root = {};
  for (const [path, val] of Object.entries(flat)) {
    const parts = path.split('.');
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        cur[part] = val;
      } else {
        if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {};
        cur = /** @type {Record<string, unknown>} */ (cur[part]);
      }
    }
  }
  return root;
}

module.exports = {
  fetchThemeLocaleAsset,
  putThemeLocaleAsset,
  isTooManyTranslationKeysError,
  flattenStringLeaves,
  unflattenLeaves,
  setDeep,
  getMainTheme,
  listThemeLocaleAssetKeys,
  resolveThemeLocaleAssetKey,
  buildThemeLocaleAssetMap,
};
