const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config } = require('../config');
const {
  getMainTheme,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { putThemeLocaleAsset, buildThemeLocaleAssetMap } = require('./themeLocale.service');
const { logger } = require('../utils/logger');
const { skipIfTextOnly } = require('../utils/textOnlyMode');

const NAV_CONFIG_PATH = path.join(process.cwd(), 'config', 'theme-nav-strings.json');

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

function loadNavConfig() {
  try {
    return JSON.parse(fs.readFileSync(NAV_CONFIG_PATH, 'utf8'));
  } catch (e) {
    logger.warn('theme_nav_config_missing', { error: e.message });
    return { bySourceValue: {}, localeKeys: {}, themeStrings: {} };
  }
}

/**
 * Register curated nav strings on the theme Translations API (matches source locale value).
 * @param {string} [themeGid]
 */
async function applyThemeNavTranslations(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  if (!theme?.id) throw new Error('No theme');

  const cfg = loadNavConfig();
  const tr = await fetchTranslatableResource(theme.id);
  const src = normalizeLocale(config.locales.source);
  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const targets = config.locales.targets
    .map(normalizeLocale)
    .filter((l) => published.has(l) && l !== src);

  let registered = 0;
  const allStrings = { ...cfg.bySourceValue, ...cfg.themeStrings };

  for (const [sourceText, perLocale] of Object.entries(allStrings)) {
    const needle = String(sourceText).trim();
    if (!needle) continue;

    const matches = (tr.translatableContent || []).filter((c) => {
      if (!c.digest) return false;
      const val = String(c.value || '').trim();
      return val === needle || val.toLowerCase() === needle.toLowerCase();
    });

    for (const item of matches) {
      const batch = [];
      for (const targetLocale of targets) {
        const value = perLocale[targetLocale] || perLocale[String(targetLocale).toUpperCase()];
        if (!value || value === needle) continue;
        batch.push({
          locale: targetLocale,
          key: item.key,
          value,
          translatableContentDigest: item.digest,
        });
      }
      if (batch.length) {
        await registerTranslationsReliable(theme.id, batch, { batchSize: 20 });
        registered += batch.length;
      }
    }
  }

  return { themeGid: theme.id, registered };
}

/**
 * Merge locale JSON keys (header / breadcrumbs) without re-translating entire theme files.
 * @param {string} themeGid
 */
async function applyThemeNavLocaleKeys(themeGid) {
  const cfg = loadNavConfig();
  const localeKeys = cfg.localeKeys || {};
  if (!Object.keys(localeKeys).length) return { locales: 0, keys: 0 };

  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const src = normalizeLocale(config.locales.source);
  const targets = [...new Set([src, ...config.locales.targets.map(normalizeLocale)])].filter((l) =>
    published.has(l)
  );
  const assetMap = await buildThemeLocaleAssetMap(themeGid, targets);

  let locales = 0;
  let keys = 0;
  /** @type {Array<{ locale: string, assetKey: string, reason: string }>} */
  const skipped = [];
  for (const targetLocale of targets) {
    const assetKey = assetMap[targetLocale] || `locales/${targetLocale}.json`;
    /** @type {Record<string, string>} */
    const patch = {};
    for (const [key, perLocale] of Object.entries(localeKeys)) {
      const val = perLocale[targetLocale];
      if (val) patch[key] = val;
    }
    if (!Object.keys(patch).length) continue;
    const put = await putThemeLocaleAsset(themeGid, assetKey, patch);
    if (put.skipped) {
      skipped.push({ locale: targetLocale, assetKey, reason: put.reason || 'skipped' });
      continue;
    }
    locales += 1;
    keys += Object.keys(patch).length;
  }
  return { locales, keys, skipped };
}

const LIQUID_CART_PATCHES = [
  ['Cart0', "{{ 'sections.header.cart' | t }}"],
  ['>Cart0<', ">{{ 'sections.header.cart' | t }}<"],
  ["'Cart' | append: cart.item_count", "{{ 'sections.header.cart' | t }}"],
];

/**
 * Fix header cart label showing literal Cart0 (theme Liquid).
 * @param {string} themeGid
 */
async function patchHeaderShopNameLiquid(_themeGid) {
  // Intentionally no-op: patching logo liquid changes header markup and can alter layout.
  return { patched: 0, reason: 'skipped_preserve_theme_design' };
}

async function patchHeaderCartLiquid(themeGid) {
  if (skipIfTextOnly('patchHeaderCartLiquid')) {
    return { patched: 0, reason: 'text_only_mode' };
  }

  const id = themeGid.split('/').pop();
  const base = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const candidates = [
    'sections/header.liquid',
    'snippets/header.liquid',
    'snippets/cart-drawer.liquid',
  ];

  let patched = 0;
  for (const assetKey of candidates) {
    let content;
    try {
      const res = await axios.get(base, { headers, params: { 'asset[key]': assetKey }, timeout: 60000 });
      content = res.data?.asset?.value;
    } catch {
      continue;
    }
    if (!content) continue;
    const needsCartPatch =
      /Cart\d/i.test(content) ||
      content.includes("'Cart'") ||
      (assetKey === 'sections/header.liquid' && content.includes('header__cart-toggle'));

    if (!needsCartPatch) continue;

    let next = content;
    for (const [from, to] of LIQUID_CART_PATCHES) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    next = next.replace(
      />(\s*)Cart(\d+)(\s*)</gi,
      ">$1{{ 'sections.header.cart' | t }} ($2)$3<"
    );
    next = next.replace(
      /(['"])Cart\1\s*\+\s*cart\.item_count/gi,
      "{{ 'sections.header.cart' | t }} ({{ cart.item_count }})"
    );
    for (const [from, to] of [
      ['My Store', 'JT Products'],
      ['Mijn winkel', 'JT Products'],
      ['>Cart0 (', ">{{ 'sections.header.cart' | t }} ("],
      ['>Cart6 (', ">{{ 'sections.header.cart' | t }} ("],
    ]) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    const cartAria =
      'aria-label="{{ \'header.general.cart\' | t }} ({{ cart.item_count }})"';
    if (next.includes('header__cart-toggle') && !next.includes('aria-label="{{ \'header.general.cart\'')) {
      next = next.replace(
        /class="header__action-item-link header__cart-toggle"/g,
        `class="header__action-item-link header__cart-toggle" ${cartAria}`
      );
    }
    if (next !== content) {
      await axios.put(
        base,
        { asset: { key: assetKey, value: next } },
        { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 120000 }
      );
      patched += 1;
      logger.info('theme_cart_liquid_patched', { assetKey });
    }
  }
  return { patched };
}

/**
 * @param {string} [themeGid]
 */
async function applyThemeStorefrontNav(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  const api = await applyThemeNavTranslations(theme.id);
  const locale = await applyThemeNavLocaleKeys(theme.id);
  const shopNameLiquid = await patchHeaderShopNameLiquid(theme.id);
  const liquid = await patchHeaderCartLiquid(theme.id);
  let menus = { skipped: true };
  if (process.env.SKIP_MENU_TRANSLATIONS !== '1') {
    try {
      const { translateStoreMenus } = require('./translateStoreMenus.service');
      menus = await translateStoreMenus();
    } catch (e) {
      logger.warn('translate_store_menus_failed', { error: e.message });
      menus = { error: e.message };
    }
  }
  return { ...api, localeKeys: locale, shopNameLiquid, liquid, menus };
}

module.exports = {
  applyThemeStorefrontNav,
  applyThemeNavTranslations,
  applyThemeNavLocaleKeys,
  patchHeaderCartLiquid,
};
