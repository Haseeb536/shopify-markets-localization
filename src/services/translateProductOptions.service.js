const { config } = require('../config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { translateResource } = require('./translation.service');
const { isDeepLQuotaError } = require('./deepl.service');
const { lookupVariantOptionTranslation } = require('../utils/variantOptions');
const { logger } = require('../utils/logger');

const PRODUCT_OPTIONS_QUERY = `
  query($id: ID!) {
    product(id: $id) {
      options {
        id
        name
        optionValues { id name }
      }
    }
  }
`;

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * Register glossary-backed option name/value when we have a curated mapping.
 * @param {string} gid
 * @param {Array<{key:string,value:string,digest:string,locale:string}>} sourceItems
 * @param {'name' | 'value'} kind
 */
/**
 * Publish variant option/value from catalog name when Translations API source row is missing/wrong locale.
 * @param {string} gid
 * @param {string} catalogName
 * @param {'name' | 'value'} kind
 */
/**
 * Shopify uses key "name" for both PRODUCT_OPTION and PRODUCT_OPTION_VALUE rows.
 * @param {Array<{key:string,digest:string}>} rows
 */
function pickOptionDigestRow(rows) {
  return (
    rows.find((c) => c.key === 'name' && c.digest) ||
    rows.find((c) => c.key === 'value' && c.digest) ||
    rows.find((c) => c.digest)
  );
}

async function publishGlossaryFromCatalogName(gid, catalogName, kind) {
  const name = String(catalogName || '').trim();
  if (!name) return 0;
  const tr = await fetchTranslatableResource(gid);
  const digestRow = pickOptionDigestRow(tr.translatableContent || []);
  if (!digestRow) return 0;
  return publishGlossaryOptionTranslations(
    gid,
    [{ key: digestRow.key, value: name, digest: digestRow.digest }],
    kind
  );
}

async function publishGlossaryOptionTranslations(gid, sourceItems, kind) {
  const src = normalizeLocale(config.locales.source);
  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const targets = config.locales.targets
    .map(normalizeLocale)
    .filter((l) => published.has(l) && l !== src);

  let publishedCount = 0;
  for (const item of sourceItems) {
    const sourceText = String(item.value || '').trim();
    if (!sourceText) continue;

    const batch = [];
    for (const targetLocale of targets) {
      const mapped = lookupVariantOptionTranslation(sourceText, targetLocale, kind);
      if (!mapped || mapped === sourceText) continue;
      batch.push({
        locale: targetLocale,
        key: item.key,
        value: mapped,
        translatableContentDigest: item.digest,
      });
    }
    if (batch.length) {
      await registerTranslationsReliable(gid, batch, { batchSize: 20 });
      publishedCount += batch.length;
    }
  }
  return publishedCount;
}

/**
 * Translate PRODUCT_OPTION / PRODUCT_OPTION_VALUE (Kleur → Color, Zwart → Black).
 * @param {string} productGid
 */
async function translateProductOptionsForProduct(productGid) {
  const data = await graphql(PRODUCT_OPTIONS_QUERY, { id: productGid });
  const optionGids = [];
  const valueGids = [];
  /** @type {Map<string, string>} */
  const valueNameByGid = new Map();

  /** @type {Map<string, string>} */
  const optionNameByGid = new Map();

  for (const opt of data?.product?.options || []) {
    if (opt?.id) {
      optionGids.push(opt.id);
      if (opt.name) optionNameByGid.set(opt.id, opt.name);
    }
    for (const ov of opt?.optionValues || []) {
      if (ov?.id) {
        valueGids.push(ov.id);
        if (ov.name) valueNameByGid.set(ov.id, ov.name);
      }
    }
  }

  const results = [];
  let glossaryPublished = 0;

  for (const gid of optionGids) {
    try {
      const tr = await fetchTranslatableResource(gid);
      const srcItems = (tr.translatableContent || []).filter(
        (c) => normalizeLocale(c.locale) === normalizeLocale(config.locales.source) && c.value?.trim()
      );
      glossaryPublished += await publishGlossaryFromCatalogName(gid, optionNameByGid.get(gid), 'name');
      glossaryPublished += await publishGlossaryOptionTranslations(gid, srcItems, 'name');
      const r = await translateResource(gid, { topic: 'product-option' });
      if (!r.skipped) results.push({ gid, kind: 'option', ok: true });
    } catch (e) {
      if (isDeepLQuotaError(e)) throw e;
      logger.warn('product_option_translate_failed', { gid, error: e.message });
      results.push({ gid, kind: 'option', ok: false, error: e.message });
    }
  }

  for (const gid of valueGids) {
    try {
      const tr = await fetchTranslatableResource(gid);
      const srcItems = (tr.translatableContent || []).filter(
        (c) => normalizeLocale(c.locale) === normalizeLocale(config.locales.source) && c.value?.trim()
      );
      const catalogRows = await publishGlossaryFromCatalogName(gid, valueNameByGid.get(gid), 'value');
      const glossaryRows = await publishGlossaryOptionTranslations(gid, srcItems, 'value');
      glossaryPublished += catalogRows + glossaryRows;
      let deepLOk = false;
      try {
        const r = await translateResource(gid, { topic: 'product-option-value' });
        deepLOk = !r.skipped;
      } catch (e) {
        if (isDeepLQuotaError(e)) throw e;
        logger.warn('product_option_value_translate_failed', { gid, error: e.message });
        results.push({
          gid,
          kind: 'value',
          ok: catalogRows + glossaryRows > 0,
          glossaryOnly: catalogRows + glossaryRows > 0,
          name: valueNameByGid.get(gid),
          error: e.message,
        });
        continue;
      }
      if (deepLOk || glossaryRows > 0) {
        results.push({ gid, kind: 'value', ok: true, name: valueNameByGid.get(gid) });
      }
    } catch (e) {
      if (isDeepLQuotaError(e)) throw e;
      logger.warn('product_option_value_translate_failed', { gid, error: e.message });
      results.push({ gid, kind: 'value', ok: false, error: e.message });
    }
  }

  return {
    options: optionGids.length,
    values: valueGids.length,
    glossaryPublished,
    translated: results.filter((r) => r.ok).length,
    results,
  };
}

module.exports = {
  translateProductOptionsForProduct,
  publishGlossaryOptionTranslations,
  publishGlossaryFromCatalogName,
};
