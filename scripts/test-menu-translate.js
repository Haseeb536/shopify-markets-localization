require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllMenus, graphql } = require('../src/services/shopify.service');
const { translateStoreMenus, toLinkGid } = require('../src/services/translateStoreMenus.service');

function flatten(items, acc) {
  for (const item of items || []) {
    const linkGid = toLinkGid(item?.id);
    if (linkGid && item?.title) acc.push({ id: linkGid, title: item.title });
    if (item?.items) flatten(item.items, acc);
  }
}

(async () => {
  assertRequired();
  const menus = await listAllMenus();
  console.log('menus:', menus.length);
  if (menus[0]) {
    const d = await graphql(
      `query MenuItems($id: ID!) {
        menu(id: $id) {
          items { id title items { id title } }
        }
      }`,
      { id: menus[0].id }
    );
    const items = [];
    flatten(d.menu?.items, items);
    console.log('menu items sample:', items);
  }
  const r = await translateStoreMenus();
  console.log('result:', r);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
