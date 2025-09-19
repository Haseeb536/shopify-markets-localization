const { config } = require('../config');
const { listAllProductGids } = require('./shopify.service');
const { translateResource } = require('./translation.service');
const { translateProductOptionsForProduct } = require('./translateProductOptions.service');
const { applyThemeStorefrontNav } = require('./themeStorefrontNav.service');
const { patchThemeContactAndFooter } = require('./themeContactPatch.service');
const { fixAllProductTitlesWithGlossary } = require('./fixAllProductTitles.service');
const { repairPublishedProductBodies } = require('./repairPublishedProductBodies.service');
const {
  translateRelatedProductsForPage,
  fixRelatedProductTitlesCatalog,
} = require('./translateRelatedProducts.service');
const { translateProductPageSchemaKeys } = require('./themeLocaleSchema.service');
const { translateShopName } = require('./translateShopName.service');
const { fixThemeProductStrings } = require('./fixThemeProductStrings.service');
const { fixNlColorOptionValues } = require('./fixNlColorOptionValues.service');
const { getMainTheme } = require('./shopify.service');
const { logger } = require('../utils/logger');
const { skipIfTextOnly } = require('../utils/textOnlyMode');

/**
 * Re-translate all product titles (fixes Dutch fragments in recommendations).
 * @param {string[]} productGids
 */
async function retranslateAllProductTitles(productGids) {
  let ok = 0;
  let skipped = 0;
  for (const gid of productGids) {
    try {
      const r = await translateResource(gid, { topic: 'catalog-title-fix' }, (key) => key === 'title');
      if (r.skipped) skipped += 1;
      else ok += 1;
    } catch (e) {
      logger.warn('catalog_title_fix_failed', { gid, error: e.message });
    }
  }
  return { ok, skipped, total: productGids.length };
}

/**
 * Re-translate body_html with FAQ chunking + dedupe (optional — uses DeepL quota).
 * @param {string[]} productGids
 */
async function retranslateAllProductBodies(productGids) {
  let ok = 0;
  let skipped = 0;
  for (const gid of productGids) {
    try {
      const r = await translateResource(
        gid,
        { topic: 'catalog-body-fix' },
        (key) => String(key).toLowerCase() === 'body_html'
      );
      if (r.skipped) skipped += 1;
      else ok += 1;
    } catch (e) {
      logger.warn('catalog_body_fix_failed', { gid, error: e.message });
    }
  }
  return { ok, skipped, total: productGids.length };
}

/**
 * Variant options + theme nav + shipping date locales.
 * @param {object} [opts]
 * @param {boolean} [opts.titles=true] apply glossary to titles (Inlaatkanaal, Intake, …)
 * @param {boolean} [opts.titleRetranslate=false] full DeepL title pass (slow)
 * @param {boolean} [opts.bodies=false]
 * @param {boolean} [opts.repairBodies=true] structural FAQ/dedupe fix without DeepL
 * @param {boolean} [opts.options=true]
 * @param {boolean} [opts.theme=true]
 * @param {boolean} [opts.related=true] glossary-fix titles on recommendation graph
 * @param {boolean} [opts.relatedDeepL=false] full DeepL pass on related products (slow)
 * @param {string[]} [opts.productGids]
 */
async function runCatalogStructuralFix(opts = {}) {
  const {
    titles = true,
    titleRetranslate = false,
    bodies = false,
    repairBodies = true,
    options = true,
    theme = true,
    related = true,
    relatedDeepL = false,
    productGids: gidsIn,
  } = opts;

  const productGids = gidsIn?.length ? gidsIn : await listAllProductGids();
  const runRelated = related && (titles || relatedDeepL);
  /** @type {Record<string, unknown>} */
  const report = { products: productGids.length };

  if (theme) {
    const blocked = skipIfTextOnly('runCatalogStructuralFix.theme');
    if (blocked) {
      report.themeSkipped = blocked;
    } else {
    try {
      report.shopName = await translateShopName();
    } catch (e) {
      logger.warn('shop_name_translate_failed', { error: e.message });
      report.shopName = { error: e.message };
    }
    try {
      report.themeNav = await applyThemeStorefrontNav();
    } catch (e) {
      logger.warn('theme_nav_fix_failed', { error: e.message });
      report.themeNav = { error: e.message };
    }
    try {
      report.themeDates = await patchThemeContactAndFooter();
    } catch (e) {
      logger.warn('theme_dates_fix_failed', { error: e.message });
      report.themeDates = { error: e.message };
    }
    try {
      const theme = await getMainTheme();
      if (theme?.id) {
        report.themeProductStrings = await fixThemeProductStrings();
        report.themeSchemaKeys = await translateProductPageSchemaKeys(theme.id);
      }
    } catch (e) {
      logger.warn('theme_schema_keys_failed', { error: e.message });
      report.themeSchemaKeys = { error: e.message };
    }
    }
  }

  if (options) {
    try {
      report.nlColorValues = await fixNlColorOptionValues(productGids);
    } catch (e) {
      logger.warn('nl_color_values_fix_failed', { error: e.message });
      report.nlColorValues = { error: e.message };
    }
    let optionsOk = 0;
    let glossaryPublished = 0;
    for (const gid of productGids) {
      try {
        const r = await translateProductOptionsForProduct(gid);
        if (r.translated) optionsOk += 1;
        glossaryPublished += r.glossaryPublished || 0;
      } catch (e) {
        logger.warn('catalog_options_fix_failed', { gid, error: e.message });
      }
    }
    report.variantOptions = { products: optionsOk, glossaryPublished };
  }

  if (titles) {
    try {
      report.titleGlossary = await fixAllProductTitlesWithGlossary(productGids);
    } catch (e) {
      logger.warn('title_glossary_fix_failed', { error: e.message });
      report.titleGlossary = { error: e.message };
    }
    if (titleRetranslate) {
      report.titles = await retranslateAllProductTitles(productGids);
    }
  }

  if (repairBodies) {
    try {
      report.bodyRepair = await repairPublishedProductBodies(productGids);
    } catch (e) {
      logger.warn('body_repair_failed', { error: e.message });
      report.bodyRepair = { error: e.message };
    }
  }

  if (bodies) {
    report.bodies = await retranslateAllProductBodies(productGids);
  }

  if (runRelated) {
    try {
      report.relatedTitles = await fixRelatedProductTitlesCatalog(productGids);
    } catch (e) {
      logger.warn('related_titles_fix_failed', { error: e.message });
      report.relatedTitles = { error: e.message };
    }
  }

  if (relatedDeepL && productGids.length === 1) {
    report.relatedDeepL = await translateRelatedProductsForPage(productGids[0]);
  } else if (relatedDeepL) {
    let relatedOk = 0;
    for (const gid of productGids.slice(0, 8)) {
      try {
        await translateRelatedProductsForPage(gid);
        relatedOk += 1;
      } catch (e) {
        logger.warn('related_products_deepl_failed', { gid, error: e.message });
      }
    }
    report.relatedDeepL = { sampled: relatedOk };
  }

  return report;
}

module.exports = {
  runCatalogStructuralFix,
  retranslateAllProductTitles,
  retranslateAllProductBodies,
};
