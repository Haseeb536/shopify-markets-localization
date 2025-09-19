require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllMenus, fetchTranslatableResource } = require('../src/services/shopify.service');

(async () => {
  assertRequired();
  const menus = await listAllMenus();
  for (const menu of menus) {
    const tr = await fetchTranslatableResource(menu.id);
    console.log('\n', menu.title, menu.id);
    for (const c of tr.translatableContent || []) {
      if (c.value?.trim()) console.log(' ', c.locale, c.key, '=', c.value);
    }
  }
})();
