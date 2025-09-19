require('dotenv').config();
const { assertRequired } = require('../src/config');
const { applyThemeStorefrontNav } = require('../src/services/themeStorefrontNav.service');
assertRequired();

(async () => {
  const r = await applyThemeStorefrontNav();
  console.log(r);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
