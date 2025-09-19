/**
 * Targeted fix for flagship Yaris intake (live ES/FR issues).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { repairShippingCalculatorLiquid } = require('../src/services/repairShippingCalculator.service');
const { applyThemeStorefrontNav } = require('../src/services/themeStorefrontNav.service');
const { fixThemeProductStrings } = require('../src/services/fixThemeProductStrings.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  assertRequired();
  clearGlossaryCaches();
  const shipping = await repairShippingCalculatorLiquid();
  const theme = await applyThemeStorefrontNav();
  const strings = await fixThemeProductStrings();
  const bodies = await repairPublishedProductBodies([FLAGSHIP]);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ shipping, theme: { shopName: theme.shopNameLiquid, registered: theme.registered }, strings, bodies }, null, 2));
})();
