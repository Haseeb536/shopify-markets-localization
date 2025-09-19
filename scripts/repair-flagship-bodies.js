require('dotenv').config();
const { assertRequired } = require('../src/config');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  assertRequired();
  const r = await repairPublishedProductBodies([FLAGSHIP]);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(r, null, 2));
})();
