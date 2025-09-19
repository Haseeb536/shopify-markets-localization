/**
 * Apply locale QA post-edits to existing Shopify translations (no DeepL).
 * Usage: node scripts/apply-product-locale-qa.js <productId> <locale>
 * Example: node scripts/apply-product-locale-qa.js 10360907989339 it
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  fetchTranslatableResource,
  registerTranslations,
  Gid,
} = require('../src/services/shopify.service');
const { applyGlossaryPost, loadGlossary } = require('../src/utils/glossary');
const {
  extractJsonLdFromHtml,
  finalizeProductBodyHtml,
  isProductBodyKey,
} = require('../src/utils/productHtml');
const { toDeepLTarget } = require('../src/services/deepl.service');
const { config } = require('../src/config');

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

(async () => {
  assertRequired();
  const productId = process.argv[2];
  const localeArg = process.argv[3] || 'it';
  const allLocales = localeArg === 'all';
  const targetLocales = allLocales
    ? config.locales.targets.map(normalizeLocale)
    : [normalizeLocale(localeArg)];
  if (!productId) {
    console.error('Usage: node scripts/apply-product-locale-qa.js <productId> <locale|all>');
    process.exit(1);
  }

  const gid = Gid.product(productId);
  const tr = await fetchTranslatableResource(gid);
  const glossaryMap = loadGlossary(config.paths.glossary);

  const srcRows = (tr.translatableContent || []).filter(
    (c) => normalizeLocale(c.locale) === normalizeLocale(config.locales.source) && c.value?.trim()
  );
  const digestByKey = new Map(srcRows.map((c) => [c.key, c.digest]));

  for (const targetLocale of targetLocales) {
    const deeplTarget = toDeepLTarget(targetLocale);
    const fromTranslations = await fetchExistingTranslations(gid, targetLocale);
    const byKey = new Map();
    for (const row of fromTranslations) {
      if (row.value) byKey.set(row.key, row);
    }

    const batch = [];
    for (const [key, row] of byKey) {
      const digest = row.digest || digestByKey.get(key);
      if (!digest) continue;
      let fixed = applyGlossaryPost(row.value, deeplTarget, glossaryMap);
      if (isProductBodyKey(key)) {
        const split = extractJsonLdFromHtml(fixed);
        fixed = await finalizeProductBodyHtml(split.html, targetLocale, {
          jsonLdBlocks: split.jsonLdBlocks,
        });
      }
      if (fixed === row.value) continue;
      batch.push({
        locale: targetLocale,
        key,
        value: fixed,
        translatableContentDigest: digest,
      });
    }

    if (!batch.length) {
      console.log('No QA changes for', targetLocale);
      continue;
    }

    for (let i = 0; i < batch.length; i += 20) {
      await registerTranslations(gid, batch.slice(i, i + 20));
    }
    console.log('Updated', batch.length, 'fields for', targetLocale);
  }
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});

async function fetchExistingTranslations(resourceGid, locale) {
  const { graphql } = require('../src/services/shopify.service');
  const data = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value outdated }
      }
    }`,
    { id: resourceGid, locale }
  );
  return data.translatableResource?.translations || [];
}
