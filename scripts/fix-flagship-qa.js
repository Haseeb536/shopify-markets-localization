require('dotenv').config();
const { assertRequired } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { translateProductOptionsForProduct } = require('../src/services/translateProductOptions.service');
const { applyThemeStorefrontNav } = require('../src/services/themeStorefrontNav.service');
const { fixThemeProductStrings } = require('../src/services/fixThemeProductStrings.service');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  assertRequired();
  clearGlossaryCaches();
  const theme = await applyThemeStorefrontNav();
  const strings = await fixThemeProductStrings();
  const options = await translateProductOptionsForProduct(FLAGSHIP);
  const titles = await fixAllProductTitlesWithGlossary([FLAGSHIP]);
  const bodies = await repairPublishedProductBodies([FLAGSHIP]);
  console.log(JSON.stringify({ theme, strings, options, titles, bodies }, null, 2));
})();
