const { enqueueGids } = require('./bulk-helper');

(async () => {
  try {
    const gids = await listAllPageGids();
    await enqueueGids('page', gids, 'bulk-pages');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
