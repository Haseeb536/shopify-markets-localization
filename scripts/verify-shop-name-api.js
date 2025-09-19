require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslationsMap } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  for (const loc of ['nl', 'de', 'en', 'es', 'fr', 'it']) {
    const map = await fetchTranslationsMap(theme.id, loc);
    console.log(loc, map.get('header.general.shop_name') || '(missing)');
  }
})();
