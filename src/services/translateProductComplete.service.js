const { config } = require('../config');
const {
  getMainTheme,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { translateProductOptionsForProduct } = require('./translateProductOptions.service');
const { translateResource } = require('./translation.service');
const { translateContentItems, toDeepLTarget } = require('./deepl.service');
const { loadGlossary, applyGlossaryPost } = require('../utils/glossary');
const { patchThemeSnippetStrings, SNIPPET_STRINGS } = require('./themeSnippetStrings.service');
const { patchThemeContactAndFooter, LOCALE_STRINGS } = require('./themeContactPatch.service');
const { translateAndPublishLocaleKeys } = require('./themeLocaleKeys.service');
const {
  translateProductPageSchemaKeys,
  applyEnglishLocaleCopyFixes,
} = require('./themeLocaleSchema.service');
const { translateRelatedProductsForPage } = require('./translateRelatedProducts.service');
const { deployJtLocaleFallback } = require('./jtLocaleFallback.service');
const { applyHtmlStructureQa } = require('../utils/productHtml');
const { logger } = require('../utils/logger');

const PRODUCT_PAGE_THEME_PREFIXES = [
  'section.product.json',
  'section.sections/footer-group.json',
];

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

function shouldSkipThemeKey(key, value) {
  const k = String(key).toLowerCase();
  const v = String(value || '').trim();
  if (/custom_icon|_link$|\.link:|shopify:\/\//.test(k) || /^https?:\/\//i.test(v)) {
    return true;
  }
  if (v.startsWith('shopify://')) return true;
  return false;
}

/**
 * Translate every NL string in templates/product.json (accordions, icons, contact block).
 * @param {string} themeGid
 */
async function translateProductTemplateTheme(themeGid) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(themeGid);
  const src = normalizeLocale(config.locales.source);
  const items = (tr.translatableContent || []).filter(
    (c) =>
      PRODUCT_PAGE_THEME_PREFIXES.some((p) => c.key.startsWith(p)) &&
      normalizeLocale(c.locale) === src &&
      c.value?.trim() &&
      !shouldSkipThemeKey(c.key, c.value)
  );

  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const targets = config.locales.targets
    .map(normalizeLocale)
    .filter((l) => published.has(l) && l !== src);

  const results = [];
  for (const targetLocale of targets) {
    const translated = await translateContentItems(
      items.map((c) => ({ key: c.key, text: c.value })),
      targetLocale,
      src
    );
    const deeplTarget = toDeepLTarget(targetLocale);
    const batch = items.map((c, i) => ({
      locale: targetLocale,
      key: c.key,
      value: applyHtmlStructureQa(
        applyGlossaryPost(translated[i] ?? c.value, deeplTarget, glossaryMap),
        targetLocale
      ),
      translatableContentDigest: c.digest,
    }));

    const regs = await registerTranslationsReliable(themeGid, batch, { batchSize: 8 });
    results.push({ locale: targetLocale, count: batch.length, register: regs });
  }

  return { keys: items.length, targets, results };
}

/**
 * Full product page: catalog fields + product template theme + trust snippets + jt locale files.
 * @param {string} productGid
 * @param {{ withRelated?: boolean, relatedQuery?: string }} [opts]
 */
async function translateProductComplete(productGid, opts = {}) {
  const theme = await getMainTheme();
  if (!theme?.id) throw new Error('No MAIN theme');

  const patchSnippets = await patchThemeSnippetStrings(theme.id);
  const patchContact = await patchThemeContactAndFooter(theme.id);
  const jtFallback = await deployJtLocaleFallback(theme.id);
  const localeKeys = await translateAndPublishLocaleKeys(theme.id, {
    ...SNIPPET_STRINGS,
    ...LOCALE_STRINGS,
  });
  const schemaKeys = await translateProductPageSchemaKeys(theme.id);
  const enCopyFixes = await applyEnglishLocaleCopyFixes(theme.id);

  const productResult = await translateResource(productGid, {
    topic: 'translate-product-complete',
  });

  const productOptions = await translateProductOptionsForProduct(productGid);

  const templateTheme = await translateProductTemplateTheme(theme.id);

  let related = null;
  if (opts.withRelated !== false) {
    related = await translateRelatedProductsForPage(
      productGid,
      opts.relatedQuery || 'Yaris GR'
    );
  }

  return {
    productGid,
    themeGid: theme.id,
    patchSnippets,
    patchContact,
    jtFallback,
    localeKeys,
    schemaKeys,
    enCopyFixes,
    product: productResult,
    productOptions,
    productTemplateTheme: templateTheme,
    related,
  };
}

module.exports = {
  translateProductComplete,
  translateProductTemplateTheme,
  PRODUCT_PAGE_THEME_PREFIXES,
};
