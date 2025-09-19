const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { logger } = require('../utils/logger');

const limiter = new RateLimiter(config.queue.shopifyRps);

/**
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
async function graphql(query, variables) {
  return limiter.schedule(async () => {
    try {
      const res = await axios.post(
        config.shopify.graphqlUrl,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': config.shopify.accessToken,
          },
          timeout: 120000,
        }
      );
      if (res.data.errors?.length) {
        const msg = res.data.errors.map((e) => e.message).join('; ');
        logger.error('shopify_graphql_errors', { errors: res.data.errors });
        throw new Error(`Shopify GraphQL: ${msg}`);
      }
      return res.data.data;
    } catch (err) {
      logger.error('shopify_api_error', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
      throw err;
    }
  });
}

/**
 * @param {string} path e.g. products/123.json
 * @param {Record<string, unknown>} [params]
 */
async function restGet(path, params) {
  return limiter.schedule(async () => {
    const url = `${config.shopify.adminBaseUrl}/${path.replace(/^\//, '')}`;
    try {
      const res = await axios.get(url, {
        params,
        headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
        timeout: 60000,
      });
      return res.data;
    } catch (err) {
      logger.error('shopify_rest_error', {
        path,
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
      throw err;
    }
  });
}

const TRANS_RESOURCE_QUERY = `
  query Translatable($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        field
        message
      }
      translations {
        key
        locale
        value
      }
    }
  }
`;

/**
 * @param {string} resourceGid
 * @returns {Promise<{ resourceId: string, translatableContent: Array<{key:string,value:string,digest:string,locale:string}>}>}
 */
async function fetchTranslatableResource(resourceGid) {
  const data = await graphql(TRANS_RESOURCE_QUERY, { resourceId: resourceGid });
  const tr = data?.translatableResource;
  if (!tr) {
    throw new Error(`No translatableResource for ${resourceGid}`);
  }
  return tr;
}

/**
 * Like fetchTranslatableResource but returns null on invalid / missing resources (no throw).
 * @param {string} resourceGid
 */
async function fetchTranslatableResourceSafe(resourceGid) {
  try {
    return await fetchTranslatableResource(resourceGid);
  } catch (e) {
    if (/invalid id|RESOURCE_NOT_FOUND|No translatableResource/i.test(e.message)) {
      return null;
    }
    throw e;
  }
}

/**
 * @param {string} resourceGid
 * @param {Array<{ locale: string, key: string, value: string, translatableContentDigest: string }>} translations
 */
async function registerTranslations(resourceGid, translations) {
  if (!translations.length) return { userErrors: [], translations: [] };
  const data = await graphql(REGISTER_MUTATION, {
    resourceId: resourceGid,
    translations,
  });
  const result = data?.translationsRegister;
  if (result?.userErrors?.length) {
    logger.warn('translations_register_user_errors', {
      resourceGid,
      userErrors: result.userErrors,
    });
  }
  return result;
}

function hasTooManyKeysError(userErrors) {
  return (userErrors || []).some((e) =>
    /too many translation keys/i.test(String(e.message || ''))
  );
}

/**
 * Register in batches; on "too many translation keys", retry each item alone.
 * @param {string} resourceGid
 * @param {Array<{ locale: string, key: string, value: string, translatableContentDigest: string }>} translations
 * @param {{ batchSize?: number }} [opts]
 */
async function registerTranslationsReliable(resourceGid, translations, opts = {}) {
  const batchSize = opts.batchSize ?? 8;
  const outcomes = [];
  for (let i = 0; i < translations.length; i += batchSize) {
    const slice = translations.slice(i, i + batchSize);
    let reg = await registerTranslations(resourceGid, slice);
    if (hasTooManyKeysError(reg?.userErrors)) {
      for (const one of slice) {
        reg = await registerTranslations(resourceGid, [one]);
        outcomes.push(reg);
      }
    } else {
      outcomes.push(reg);
    }
  }
  return outcomes;
}

/**
 * @param {string} resourceGid
 * @param {string} locale
 * @returns {Promise<Map<string, string>>}
 */
async function fetchTranslationsMap(resourceGid, locale) {
  const data = await graphql(
    `query($id: ID!, $locale: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $locale) { key value }
      }
    }`,
    { id: resourceGid, locale }
  );
  const rows = data?.translatableResource?.translations || [];
  return new Map(rows.map((t) => [t.key, t.value]));
}

function gid(type, numericId) {
  return `gid://shopify/${type}/${numericId}`;
}

const Gid = {
  product: (id) => gid('Product', id),
  collection: (id) => gid('Collection', id),
  page: (id) => gid('OnlineStorePage', id),
  blog: (id) => gid('Blog', id),
  article: (id) => gid('Article', id),
  menu: (id) => gid('Menu', id),
};

const MENUS_QUERY = `
  query Menus($cursor: String) {
    menus(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node { id title handle } }
    }
  }
`;

async function listAllMenus() {
  const menus = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const data = await graphql(MENUS_QUERY, { cursor });
    const conn = data?.menus;
    for (const edge of conn?.edges || []) {
      if (edge?.node?.id) menus.push(edge.node);
    }
    hasNext = conn?.pageInfo?.hasNextPage;
    cursor = conn?.pageInfo?.endCursor || null;
  }
  return menus;
}

const THEMES_QUERY = `
  query Themes {
    themes(first: 10, roles: [MAIN]) {
      nodes { id name role }
    }
  }
`;

async function getMainTheme() {
  const data = await graphql(THEMES_QUERY, {});
  const nodes = data?.themes?.nodes || [];
  return nodes[0] || null;
}

const SHOP_LOCALES_QUERY = `
  query ShopLocales {
    shopLocales {
      locale
      primary
      published
    }
  }
`;

/** @returns {Promise<string>} e.g. "en", "nl" */
async function getShopPrimaryLocale() {
  const locales = await getShopLocales();
  const primary = locales.find((l) => l.primary);
  const locale = primary?.locale || locales[0]?.locale || config.locales.source;
  return String(locale).toLowerCase().split('-')[0];
}

/** @returns {Promise<Array<{ locale: string, primary: boolean, published: boolean }>>} */
async function getShopLocales() {
  const data = await graphql(SHOP_LOCALES_QUERY, {});
  return data?.shopLocales || [];
}

/** Published locale codes on the shop (e.g. ["en", "de"]). */
async function getShopPublishedLocaleCodes() {
  const locales = await getShopLocales();
  return locales
    .filter((l) => l.published)
    .map((l) => String(l.locale).toLowerCase().split('-')[0]);
}

async function paginateConnection(query, pathToEdges, pathToPageInfo) {
  const ids = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const data = await graphql(query, { cursor });
    let cur = data;
    for (const part of pathToEdges.split('.')) {
      cur = cur?.[part];
    }
    const edges = cur?.edges || [];
    for (const e of edges) {
      if (e?.node?.id) ids.push(e.node.id);
    }
    let pi = data;
    for (const part of pathToPageInfo.split('.')) {
      pi = pi?.[part];
    }
    const pageInfo = pi?.pageInfo || pi;
    hasNext = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor || null;
  }
  return ids;
}

const PRODUCTS_LIST = `
  query ProductIds($cursor: String) {
    products(first: 50, after: $cursor, sortKey: ID, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      edges { node { id } }
    }
  }
`;

const COLLECTIONS_LIST = `
  query CollectionIds($cursor: String) {
    collections(first: 50, after: $cursor, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      edges { node { id } }
    }
  }
`;

const PAGES_LIST = `
  query PageIds($cursor: String) {
    pages(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node { id } }
    }
  }
`;

const ARTICLES_LIST = `
  query ArticleIds($cursor: String) {
    articles(first: 50, after: $cursor, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges { node { id } }
    }
  }
`;

async function listAllProductGids() {
  return paginateConnection(PRODUCTS_LIST, 'products', 'products');
}

async function listAllCollectionGids() {
  return paginateConnection(COLLECTIONS_LIST, 'collections', 'collections');
}

async function listAllPageGids() {
  return paginateConnection(PAGES_LIST, 'pages', 'pages');
}

async function listAllArticleGids() {
  return paginateConnection(ARTICLES_LIST, 'articles', 'articles');
}

const BLOGS_LIST = `
  query BlogIds($cursor: String) {
    blogs(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node { id } }
    }
  }
`;

async function listAllBlogGids() {
  return paginateConnection(BLOGS_LIST, 'blogs', 'blogs');
}

module.exports = {
  graphql,
  restGet,
  fetchTranslatableResource,
  fetchTranslatableResourceSafe,
  registerTranslations,
  registerTranslationsReliable,
  fetchTranslationsMap,
  Gid,
  listAllMenus,
  getMainTheme,
  getShopPrimaryLocale,
  getShopLocales,
  getShopPublishedLocaleCodes,
  listAllProductGids,
  listAllCollectionGids,
  listAllPageGids,
  listAllArticleGids,
  listAllBlogGids,
};
