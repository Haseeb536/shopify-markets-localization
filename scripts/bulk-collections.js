const { enqueueGids } = require('./bulk-helper');

(async () => {
  try {
    const gids = await listAllCollectionGids();
    await enqueueGids('collection', gids, 'bulk-collections');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
