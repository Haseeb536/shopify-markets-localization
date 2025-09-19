require('dotenv').config();
const { assertRequired } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
assertRequired();
clearGlossaryCaches();

const GIDS = [
  'gid://shopify/Product/10360906613083',
  'gid://shopify/Product/10360906875227',
  'gid://shopify/Product/10360906187099',
];

(async () => {
  console.log('Titles:', await fixAllProductTitlesWithGlossary(GIDS));
  console.log('Bodies:', await repairPublishedProductBodies(GIDS));
})();
