const { config } = require('../config');
const { getMainTheme, listAllProductGids } = require('./shopify.service');
const { patchThemeSnippetStrings, SNIPPET_STRINGS } = require('./themeSnippetStrings.service');
const { patchThemeContactAndFooter, LOCALE_STRINGS } = require('./themeContactPatch.service');
const { applyThemeStorefrontNav } = require('./themeStorefrontNav.service');
const { translateAndPublishLocaleKeys } = require('./themeLocaleKeys.service');
const { translateResource } = require('./translation.service');
const { translateThemeLocaleAssets } = require('./themeLocaleTranslate.service');
const { translateProductOptionsForProduct } = require('./translateProductOptions.service');
const { logger } = require('../utils/logger');
const { skipIfTextOnly } = require('../utils/textOnlyMode');
const { mapPool } = require('../utils/asyncPool');
const { isDeepLQuotaError } = require('./deepl.service');

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
 * Phase 1 — synchronous: Liquid patches + custom locale keys + theme Translations API
 * for product-page / footer strings (all published target locales).
 */
async function syncThemeStorefrontAllLocales() {
  const blocked = skipIfTextOnly('syncThemeStorefrontAllLocales');
  if (blocked) {
    logger.info('theme_sync_skipped', blocked);
    return blocked;
  }

  const theme = await getMainTheme();
  if (!theme?.id) throw new Error('No MAIN theme');

  const patchSnippets = await patchThemeSnippetStrings(theme.id);
  const patchContact = await patchThemeContactAndFooter(theme.id);
  const patchNav = await applyThemeStorefrontNav(theme.id);

  const mergedKeys = { ...SNIPPET_STRINGS, ...LOCALE_STRINGS };
  const localeKeys = await translateAndPublishLocaleKeys(theme.id, mergedKeys);

  let themeTranslations = null;
  try {
    themeTranslations = await translateResource(
      theme.id,
      { topic: 'sync-theme-storefront' },
      matchesProductPageThemeKey,
      null
    );
  } catch (e) {
    logger.warn('sync_theme_translations_partial', { error: e.message });
    themeTranslations = { error: e.message };
  }

  return {
    themeGid: theme.id,
    patchSnippets,
    patchContact,
    patchNav,
    localeKeys,
    themeTranslations,
  };
}

/**
 * Phase 2 — queue jobs for full catalog + theme locale JSON files.
 * @param {object} [opts]
 * @param {boolean} [opts.products]
 * @param {boolean} [opts.collections]
 * @param {boolean} [opts.pages]
 * @param {boolean} [opts.menus]
 * @param {boolean} [opts.themeLocale]
 * @param {boolean} [opts.themeTranslationsApi]
 */
async function enqueueStoreCatalogJobs(opts = {}) {
  const { enqueueTranslation } = require('../queues/enqueue');
  const theme = await getMainTheme();
  const jobs = [];
  const textOnly = skipIfTextOnly('enqueueStoreCatalogJobs');

  if (opts.themeLocale !== false && !textOnly) {
    await enqueueTranslation(
      'theme-locale',
      {
        themeGid: theme.id,
        sourceAssetKey: process.env.THEME_SOURCE_ASSET || 'locales/nl.json',
      },
      { jobId: `store-complete-theme-locale-${theme.id.split('/').pop()}` }
    );
    jobs.push('theme-locale');
  }

  if (opts.themeTranslationsApi && !textOnly) {
    await enqueueTranslation(
      'theme',
      { resourceGid: theme.id, topic: 'store-complete-theme-api' },
      { jobId: `store-complete-theme-api-${theme.id.split('/').pop()}` }
    );
    jobs.push('theme-translations-api');
  }

  if (opts.products !== false) {
    const gids = await listAllProductGids();
    for (const gid of gids) {
      const numeric = gid.split('/').pop();
      await enqueueTranslation(
        'product',
        { resourceGid: gid, topic: 'store-complete-products' },
        { jobId: `store-complete-product-${numeric}` }
      );
    }
    jobs.push(`products:${gids.length}`);
  }

  return { themeGid: theme.id, queued: jobs };
}

/**
 * Phase 2 without Redis — same jobs as the worker, run sequentially in this process.
 */
async function translateCatalogResources(gids, topic, opts = {}) {
  const skipGids = opts.skipGids || new Set();
  const done = [];
  const errors = [];
  let i = 0;
  for (const gid of gids) {
    if (skipGids.has(gid)) continue;
    i += 1;
    try {
      await translateResource(gid, { topic });
      done.push(gid);
      if (opts.onDone) opts.onDone(gid, true);
    } catch (e) {
      errors.push({ gid, error: e.message });
      logger.warn('sync_catalog_resource_failed', { gid, topic, error: e.message });
      if (opts.onDone) opts.onDone(gid, false, e.message);
    }
    if (i % 25 === 0 || i === gids.length) {
      // eslint-disable-next-line no-console
      console.log(`  ${topic}: ${i}/${gids.length} (${errors.length} errors)`);
    }
  }
  return { total: gids.length, processed: i, ok: done.length, errors };
}

/**
 * Phase 2 without Redis — theme locales + full catalog (+ variant options).
 * @param {object} [opts]
 * @param {boolean} [opts.withOptions] translate PRODUCT_OPTION / values per product
 * @param {Set<string>} [opts.skipGids] resume: skip already completed product GIDs
 * @param {number} [opts.productLimit] cap products (testing)
 * @param {number} [opts.productConcurrency] parallel products (default from env)
 * @param {(gid: string, ok: boolean, err?: string) => void} [opts.onProductDone]
 */
async function syncStoreCatalogInline(opts = {}) {
  const theme = await getMainTheme();
  /** @type {Record<string, unknown>} */
  const result = { themeGid: theme.id };

  if (opts.themeLocale !== false && !skipIfTextOnly('translateThemeLocaleAssets')) {
    // eslint-disable-next-line no-console
    console.log('Translating theme locale JSON assets...');
    result.themeLocale = await translateThemeLocaleAssets(
      theme.id,
      process.env.THEME_SOURCE_ASSET || 'locales/nl.json',
      opts.assetKeyByLocale
    );
  }

  if (opts.themeTranslationsApi && !skipIfTextOnly('themeTranslationsApi')) {
    result.themeTranslationsApi = await translateResource(theme.id, {
      topic: 'store-sync-no-redis-theme-api',
    });
  }

  if (opts.withCollections) {
    const { listAllCollectionGids } = require('./shopify.service');
    const gids = await listAllCollectionGids();
    // eslint-disable-next-line no-console
    console.log(`Collections (${gids.length})...`);
    result.collections = await translateCatalogResources(gids, 'store-collections');
  }

  if (opts.withPages) {
    const { listAllPageGids } = require('./shopify.service');
    const gids = await listAllPageGids();
    // eslint-disable-next-line no-console
    console.log(`Pages (${gids.length})...`);
    result.pages = await translateCatalogResources(gids, 'store-pages');
  }

  if (opts.withMenus) {
    const { listAllMenus } = require('./shopify.service');
    const menus = await listAllMenus();
    const gids = menus.map((m) => m.id).filter(Boolean);
    // eslint-disable-next-line no-console
    console.log(`Menus (${gids.length})...`);
    result.menus = await translateCatalogResources(gids, 'store-menus');
  }

  if (opts.products !== false) {
    let gids = await listAllProductGids();
    const skipGids = opts.skipGids || new Set();
    gids = gids.filter((g) => !skipGids.has(g));
    if (opts.productLimit) gids = gids.slice(0, opts.productLimit);

    const productConcurrency =
      opts.productConcurrency > 0
        ? opts.productConcurrency
        : config.queue.productConcurrency;

    // eslint-disable-next-line no-console
    console.log(
      `Products (${gids.length} to process, ${skipGids.size} skipped, concurrency=${productConcurrency})...`
    );

    const done = [];
    const errors = [];
    let finished = 0;
    const halt = { deeplQuota: false };

    async function processProduct(gid) {
      if (halt.deeplQuota) return;
      const numeric = gid.split('/').pop();
      try {
        await translateResource(gid, { topic: 'store-sync-no-redis-products' });
        if (opts.withOptions) {
          await translateProductOptionsForProduct(gid);
        }
        done.push(gid);
        if (opts.onProductDone) opts.onProductDone(gid, true);
      } catch (e) {
        if (isDeepLQuotaError(e)) {
          halt.deeplQuota = true;
        }
        errors.push({ gid, error: e.message });
        logger.warn('sync_product_inline_failed', { gid, error: e.message });
        if (opts.onProductDone) opts.onProductDone(gid, false, e.message);
        if (isDeepLQuotaError(e)) throw e;
      }
      finished += 1;
      if (finished % 10 === 0 || finished === gids.length) {
        logger.info('sync_products_inline_progress', { current: finished, total: gids.length });
        // eslint-disable-next-line no-console
        console.log(
          `Products ${finished}/${gids.length} (${errors.length} errors) — last ${numeric}`
        );
      }
    }

    try {
      await mapPool(productConcurrency, gids, processProduct);
    } catch (e) {
      if (isDeepLQuotaError(e)) {
        logger.error('deepl_quota_exceeded_stop', { completed: done.length, errors: errors.length });
        // eslint-disable-next-line no-console
        console.error(
          '\nDeepL quota exceeded — bulk run stopped. Upgrade plan or wait for quota reset, then:\n' +
            '  node scripts/translate-text-only.js --resume\n'
        );
        result.deeplQuotaExceeded = true;
      } else {
        throw e;
      }
    }
    result.products = {
      total: gids.length,
      ok: done.length,
      errors,
      withOptions: Boolean(opts.withOptions),
      concurrency: productConcurrency,
    };
  }

  return result;
}

/**
 * Full store localization: sync theme UI keys, then enqueue catalog + theme locale files.
 */
async function runStoreCompleteTranslation(options = {}) {
  const sync = options.sync !== false;
  const enqueue = options.enqueue !== false;
  const syncInline = options.syncInline === true;

  /** @type {Record<string, unknown>} */
  const result = { sourceLocale: config.locales.source, targets: config.locales.targets };

  if (sync) {
    result.sync = await syncThemeStorefrontAllLocales();
  }

  if (syncInline) {
    result.syncInline = await syncStoreCatalogInline({
      products: options.products !== false,
      themeLocale: options.themeLocale !== false,
      themeTranslationsApi: options.themeTranslationsApi,
      withOptions: options.withOptions === true,
      withCollections: options.collections,
      withPages: options.pages,
      withMenus: options.menus,
      skipGids: options.skipGids,
      productLimit: options.productLimit,
      onProductDone: options.onProductDone,
    });
  }

  if (enqueue) {
    result.enqueue = await enqueueStoreCatalogJobs({
      products: options.products !== false,
      collections: options.collections,
      pages: options.pages,
      menus: options.menus,
      themeLocale: options.themeLocale !== false,
      themeTranslationsApi: options.themeTranslationsApi,
    });
  }

  return result;
}

module.exports = {
  syncThemeStorefrontAllLocales,
  syncStoreCatalogInline,
  enqueueStoreCatalogJobs,
  runStoreCompleteTranslation,
  matchesProductPageThemeKey,
  PRODUCT_PAGE_KEY_PREFIXES,
};
