const { enqueueGids } = require('./bulk-helper');

(async () => {
  try {
    const menus = await listAllMenus();
    const gids = menus.map((m) => m.id);
    await enqueueGids('menu', gids, 'bulk-menus');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
