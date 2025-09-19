/**
 * Publish variant option glossary mappings only (no DeepL).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  graphql,
  listAllProductGids,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');
const { lookupVariantOptionTranslation } = require('../src/utils/variantOptions');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

assertRequired();
clearVariantOptionsCache();

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

function pickDigest(rows) {
  return (
    rows.find((c) => c.key === 'name' && c.digest) ||
    rows.find((c) => c.key === 'value' && c.digest) ||
    rows.find((c) => c.digest)
  );
}

async function publishGlossary(gid, catalogName, kind) {
  const name = String(catalogName || '').trim();
  if (!name) return 0;
  const tr = await fetchTranslatableResource(gid);
  const row = pickDigest(tr.translatableContent || []);
  if (!row) return 0;
  const src = norm(require('../src/config').config.locales.source);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = require('../src/config').config.locales.targets
    .map(norm)
    .filter((l) => published.has(l) && l !== src);
  const batch = [];
  for (const locale of targets) {
    const mapped = lookupVariantOptionTranslation(name, locale, kind);
    if (!mapped || mapped === name) continue;
    batch.push({
      locale,
      key: row.key,
      value: mapped,
      translatableContentDigest: row.digest,
    });
  }
  if (!batch.length) return 0;
  await registerTranslationsReliable(gid, batch, { batchSize: 20 });
  return batch.length;
}

(async () => {
  const gids = await listAllProductGids();
  let published = 0;
  let wastegateHits = 0;
  for (const productGid of gids) {
    const data = await graphql(
      `query($id: ID!) {
        product(id: $id) {
          title
          options { id name optionValues { id name } }
        }
      }`,
      { id: productGid }
    );
    const product = data.product;
    if (!product) continue;
    for (const opt of product.options || []) {
      if (/wastegate/i.test(opt.name || '')) {
        wastegateHits += 1;
        published += await publishGlossary(opt.id, opt.name, 'name');
        console.log('wastegate option:', product.title, '->', opt.name);
      }
      for (const ov of opt.optionValues || []) {
        published += await publishGlossary(ov.id, ov.name, 'value');
      }
    }
    for (const opt of product.options || []) {
      published += await publishGlossary(opt.id, opt.name, 'name');
    }
  }
  console.log(JSON.stringify({ wastegateHits, published }));
})();
