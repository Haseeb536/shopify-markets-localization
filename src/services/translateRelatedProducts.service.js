const { graphql } = require('./shopify.service');
const { translateResource } = require('./translation.service');
const { translateProductOptionsForProduct } = require('./translateProductOptions.service');
const { fixAllProductTitlesWithGlossary } = require('./fixAllProductTitles.service');
const { logger } = require('../utils/logger');

const PRODUCT_COLLECTIONS = `
  query ProductCollections($id: ID!) {
    product(id: $id) {
      collections(first: 3) {
        nodes {
          products(first: 25) {
            nodes { id title }
          }
        }
      }
    }
  }
`;

const SEARCH_PRODUCTS = `
  query SearchProducts($query: String!, $cursor: String) {
    products(first: 25, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges { node { id title } }
    }
  }
`;

/**
 * Collect GIDs for products likely shown as recommendations.
 * @param {string} productGid
 * @param {string} [searchQuery]
 */
async function discoverRelatedProductGids(productGid, searchQuery = 'Forge') {
  const excludeId = String(productGid).split('/').pop();
  const gids = new Set();
  const maxSearchPages = Number(process.env.RELATED_SEARCH_PAGES) || 1;

  try {
    const coll = await graphql(PRODUCT_COLLECTIONS, { id: productGid });
    for (const c of coll?.product?.collections?.nodes || []) {
      for (const p of c?.products?.nodes || []) {
        if (p?.id && !String(p.id).endsWith(excludeId)) gids.add(p.id);
      }
    }
  } catch (e) {
    logger.debug('collection_related_skip', { error: e.message });
  }

  let cursor = null;
  let pages = 0;
  while (pages < maxSearchPages) {
    const data = await graphql(SEARCH_PRODUCTS, { query: searchQuery, cursor });
    const conn = data?.products;
    for (const edge of conn?.edges || []) {
      const id = edge?.node?.id;
      if (id && !String(id).endsWith(excludeId)) gids.add(id);
    }
    pages += 1;
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn?.pageInfo?.endCursor || null;
  }

  const cap = Number(process.env.RELATED_DISCOVER_LIMIT) || 48;
  return [...gids].slice(0, cap);
}

/**
 * Translate recommendation / related products (titles, body, variant options).
 * @param {string} excludeProductGid
 * @param {string} [searchQuery]
 */
async function translateRelatedProductsForPage(excludeProductGid, searchQuery = 'Yaris GR') {
  const limit = Number(process.env.RELATED_PRODUCTS_LIMIT) || 24;
  const unique = (await discoverRelatedProductGids(excludeProductGid, searchQuery)).slice(0, limit);

  const results = [];
  for (const gid of unique) {
    try {
      const r = await translateResource(gid, { topic: 'related-product' });
      const titlePass = await translateResource(
        gid,
        { topic: 'related-product-title' },
        (key) => key === 'title'
      );
      const options = await translateProductOptionsForProduct(gid);

      results.push({
        gid,
        ok: true,
        locales: r.results?.map((x) => x.locale),
        options: options.translated,
        titlePass: !titlePass.skipped,
      });
    } catch (e) {
      logger.warn('related_product_translate_failed', { gid, error: e.message });
      results.push({ gid, ok: false, error: e.message });
    }
  }

  return {
    query: searchQuery,
    discovered: unique.length,
    count: unique.length,
    sources: ['productRecommendations', 'collections', 'search'],
    results,
  };
}

/**
 * Glossary-fix titles for products shown as recommendations (no DeepL).
 * @param {string[]} seedProductGids
 * @param {number} [maxSeeds]
 */
async function fixRelatedProductTitlesCatalog(seedProductGids, maxSeeds = 12) {
  const related = new Set();
  const seeds = seedProductGids.slice(0, maxSeeds);
  for (const gid of seeds) {
    try {
      const titleData = await graphql(
        `query($id: ID!) { product(id: $id) { title } }`,
        { id: gid }
      );
      const title = titleData?.product?.title || '';
      const query = /\bYaris\b/i.test(title) ? 'Yaris GR Forge' : 'Forge';
      const found = await discoverRelatedProductGids(gid, query);
      for (const id of found) related.add(id);
    } catch (e) {
      logger.debug('related_discover_skip', { gid, error: e.message });
    }
  }
  if (!related.size) return { discovered: 0, scanned: 0, updated: 0 };
  const fix = await fixAllProductTitlesWithGlossary([...related]);
  return { discovered: related.size, ...fix };
}

module.exports = {
  translateRelatedProductsForPage,
  discoverRelatedProductGids,
  fixRelatedProductTitlesCatalog,
};
