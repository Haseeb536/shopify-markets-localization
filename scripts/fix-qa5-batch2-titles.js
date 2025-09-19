require('dotenv').config();
const { assertRequired } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
assertRequired();
clearGlossaryCaches();

const GIDS = [
  'gid://shopify/Product/10360907333979',
  'gid://shopify/Product/10360893997403',
  'gid://shopify/Product/10360893505883',
  'gid://shopify/Product/10360897241435',
  'gid://shopify/Product/10360892227931',
];

(async () => {
  console.log(await fixAllProductTitlesWithGlossary(GIDS));
})();
