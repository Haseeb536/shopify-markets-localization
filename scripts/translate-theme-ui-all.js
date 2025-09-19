/**
 * Translate product-page + footer theme strings for ALL target locales (no product catalog).
 * Run before or after translate:store sync phase.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { syncThemeStorefrontAllLocales } = require('../src/services/storeComplete.service');

(async () => {
  assertRequired();
  const result = await syncThemeStorefrontAllLocales();
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
