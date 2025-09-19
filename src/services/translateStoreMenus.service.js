const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const {
  graphql,
  listAllMenus,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { logger } = require('../utils/logger');

const NAV_CONFIG_PATH = path.join(process.cwd(), 'config', 'theme-nav-strings.json');

const MENU_ITEMS_QUERY = `
  query MenuItems($id: ID!) {
    menu(id: $id) {
      id
      title
      items {
        id
        title
        items {
          id
          title
        }
      }
    }
  }
`;

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

function loadNavLabels() {
  try {
    const cfg = JSON.parse(fs.readFileSync(NAV_CONFIG_PATH, 'utf8'));
    return cfg.bySourceValue || {};
  } catch {
    return {};
  }
}

/**
 * GraphQL menu() returns MenuItem GIDs; Translations API requires Link GIDs (same numeric id).
 * @param {string} menuItemOrLinkGid
 * @returns {string|null}
 */
function toLinkGid(menuItemOrLinkGid) {
  const id = String(menuItemOrLinkGid || '');
  if (/^gid:\/\/shopify\/Link\//.test(id)) return id;
  const m = id.match(/^gid:\/\/shopify\/MenuItem\/(\d+)$/);
  if (m) return `gid://shopify/Link/${m[1]}`;
  return null;
}

/**
 * @param {unknown} items
 * @param {Array<{ id: string, title: string }>} acc
 */
function flattenMenuItems(items, acc) {
  if (!items) return;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item?.nodes) flattenMenuItems(item.nodes, acc);
      else if (item?.edges) flattenMenuItems(item.edges.map((e) => e?.node).filter(Boolean), acc);
      else {
        const linkGid = toLinkGid(item?.id);
        if (linkGid && item?.title) {
          acc.push({ id: linkGid, title: String(item.title).trim() });
        }
        if (item?.items) flattenMenuItems(item.items, acc);
      }
    }
    return;
  }
  if (typeof items === 'object' && items !== null) {
    if (items.nodes) flattenMenuItems(items.nodes, acc);
    if (items.edges) flattenMenuItems(items.edges.map((e) => e?.node).filter(Boolean), acc);
  }
}

/**
 * Translate navigation menu item titles via curated map (Home, Categories, …).
 */
async function translateStoreMenus() {
  const labels = loadNavLabels();
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets
    .map(norm)
    .filter((l) => published.has(l) && l !== norm(config.locales.source));

  const menus = await listAllMenus();
  let registered = 0;
  let menusProcessed = 0;
  let skipped = 0;
  const errors = [];

  for (const menu of menus) {
    let data;
    try {
      data = await graphql(MENU_ITEMS_QUERY, { id: menu.id });
    } catch (e) {
      logger.warn('menu_query_failed', { menuId: menu.id, error: e.message });
      errors.push({ menuId: menu.id, error: e.message });
      continue;
    }

    /** @type {Array<{ id: string, title: string }>} */
    const items = [];
    flattenMenuItems(data?.menu?.items || [], items);

    for (const item of items) {
      const sourceTitle = String(item.title || '').trim();
      const perLocale = labels[sourceTitle];
      const linkGid = toLinkGid(item.id);
      if (!perLocale || !linkGid) {
        skipped += 1;
        continue;
      }

      try {
        const tr = await fetchTranslatableResource(linkGid);
        const titleRow = (tr.translatableContent || []).find((c) => c.key === 'title' && c.digest);
        if (!titleRow) {
          skipped += 1;
          continue;
        }

        const batch = [];
        for (const targetLocale of targets) {
          const value = perLocale[targetLocale] || perLocale[String(targetLocale).toUpperCase()];
          if (!value || value === sourceTitle) continue;
          batch.push({
            locale: targetLocale,
            key: 'title',
            value,
            translatableContentDigest: titleRow.digest,
          });
        }
        if (batch.length) {
          await registerTranslationsReliable(linkGid, batch, { batchSize: 10 });
          registered += batch.length;
        }
      } catch (e) {
        logger.warn('menu_item_translate_failed', {
          itemId: item.id,
          title: sourceTitle,
          error: e.message,
        });
        errors.push({ itemId: item.id, title: sourceTitle, error: e.message });
      }
    }
    menusProcessed += 1;
  }

  return { menus: menusProcessed, registered, skipped, errors: errors.length };
}

module.exports = { translateStoreMenus, toLinkGid };
