require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
assertRequired();
clearGlossaryCaches();

(async () => {
  const gids = await listAllProductGids();
  const shortShift = [];
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title } }`, { id: gid });
    if (/short shift/i.test(d.product?.title || '')) shortShift.push(gid);
  }
  console.log('Short Shift products:', shortShift.length);
  console.log('Titles:', await fixAllProductTitlesWithGlossary(shortShift));
  console.log('Bodies:', await repairPublishedProductBodies(shortShift));
})();
