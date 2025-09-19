require('dotenv').config();
const { assertRequired } = require('../src/config');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
assertRequired();

(async () => {
  const r = await fixAllProductTitlesWithGlossary();
  console.log('Titles:', r);
})();
