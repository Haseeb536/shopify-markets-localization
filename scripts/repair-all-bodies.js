require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids } = require('../src/services/shopify.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
assertRequired();
clearGlossaryCaches();

(async () => {
  const gids = await listAllProductGids();
  console.log(await repairPublishedProductBodies(gids));
})();
