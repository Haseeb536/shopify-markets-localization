const { enqueueGids } = require('./bulk-helper');
const { listAllProductGids } = require('../src/services/shopify.service');

(async () => {
  try {
    const gids = await listAllProductGids();
    await enqueueGids('product', gids, 'bulk-products');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
