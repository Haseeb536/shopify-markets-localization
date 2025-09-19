require('dotenv').config();
const { assertRequired } = require('../src/config');
const { buildCanonicalLiquid } = require('../src/services/repairShippingCalculator.service');
const { getAbbrMonthMaps } = require('../src/utils/monthLabels');
const axios = require('axios');
const { config } = require('../src/config');
assertRequired();

(async () => {
  const liquid = buildCanonicalLiquid();
  console.log('Canonical ES map contains junio:', liquid.includes('06:junio'));
  console.log('Canonical NL map contains juni:', liquid.includes('06:juni'));
  console.log('Canonical IT map contains giugno:', liquid.includes('06:giugno'));

  const abbr = getAbbrMonthMaps();
  console.log('\nAbbr maps June:');
  for (const loc of ['de', 'fr', 'it', 'es', 'nl', 'pl', 'en']) {
    console.log(`  ${loc}: ${abbr[loc]?.jun}`);
  }

  const themeId = '196825383259';
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': 'snippets/dynamic-shipping-calculator.liquid' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const live = res.data?.asset?.value || '';
  console.log('\nLive theme ES junio:', live.includes('06:junio'));
  console.log('Live theme NL juni:', live.includes('06:juni'));
})();
