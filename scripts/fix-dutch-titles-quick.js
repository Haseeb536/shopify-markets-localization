/**
 * Glossary + locale word-order pass on all catalog product titles (all published locales).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  fixAllProductTitlesWithGlossary,
  findProductsWithDutchTitleFragments,
} = require('../src/services/fixAllProductTitles.service');
const { fixRelatedProductTitlesCatalog } = require('../src/services/translateRelatedProducts.service');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  assertRequired();
  const hits = await findProductsWithDutchTitleFragments();
  // eslint-disable-next-line no-console
  console.log('Catalog titles with Dutch fragments (before fix):', hits.length);
  const related = await fixRelatedProductTitlesCatalog([FLAGSHIP], 8);
  // eslint-disable-next-line no-console
  console.log('Related product title pass:', related);
  const r = await fixAllProductTitlesWithGlossary();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(r, null, 2));
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.message);
  process.exit(1);
});
