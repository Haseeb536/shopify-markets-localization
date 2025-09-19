const { config } = require('../config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { logger } = require('../utils/logger');

const SHOP_NAME_BY_LOCALE = {
  de: 'JT Products',
  fr: 'JT Products',
  en: 'JT Products',
  it: 'JT Products',
  es: 'JT Products',
  pl: 'JT Products',
};

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * Set primary shop.name when still on Shopify default (fixes header everywhere shop.name is used).
 */
async function updatePrimaryShopName(name = 'JT Products') {
  const data = await graphql(`query { shop { id name } }`);
  const currentName = data?.shop?.name || '';
  if (!currentName || (currentName !== 'My Store' && currentName !== 'Mijn winkel')) {
    return { updated: false, currentName };
  }
  const result = await graphql(
    `mutation($input: ShopInput!) {
      shopUpdate(input: $input) {
        shop { name }
        userErrors { field message }
      }
    }`,
    { input: { name } }
  );
  const errors = result?.shopUpdate?.userErrors || [];
  if (errors.length) {
    return { updated: false, currentName, errors };
  }
  return { updated: true, from: currentName, to: result.shopUpdate.shop.name };
}

/**
 * Register translated shop name (fixes header "My Store" on Markets).
 */
async function translateShopName() {
  const primary = await updatePrimaryShopName();
  const data = await graphql(`query { shop { id name } }`);
  const shopGid = data?.shop?.id;
  const currentName = data?.shop?.name || '';
  if (!shopGid) throw new Error('No shop GID');

  const tr = await fetchTranslatableResource(shopGid);
  const nameRow = (tr.translatableContent || []).find((c) => c.key === 'name' && c.digest);
  if (!nameRow) return { skipped: true, reason: 'no_name_digest', primary };

  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l));
  const batch = [];

  for (const locale of targets) {
    const value = SHOP_NAME_BY_LOCALE[locale] || 'JT Products';
    if (value === currentName && locale === 'en') continue;
    batch.push({
      locale,
      key: 'name',
      value,
      translatableContentDigest: nameRow.digest,
    });
  }

  if (!batch.length) return { shopGid, registered: 0, currentName, primary };

  await registerTranslationsReliable(shopGid, batch, { batchSize: 10 });
  logger.info('shop_name_translated', { registered: batch.length, from: currentName });
  return { shopGid, registered: batch.length, from: currentName, to: 'JT Products', primary };
}

module.exports = { translateShopName, updatePrimaryShopName, SHOP_NAME_BY_LOCALE };
