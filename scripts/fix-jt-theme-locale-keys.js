/**
 * Re-publish jt.* theme strings with API retry + locale file fallback (fixes IT/PL gaps).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');
const { translateAndPublishLocaleKeys } = require('../src/services/themeLocaleKeys.service');
const { LOCALE_STRINGS } = require('../src/services/themeContactPatch.service');
const { SNIPPET_STRINGS } = require('../src/services/themeSnippetStrings.service');

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const keys = { ...SNIPPET_STRINGS, ...LOCALE_STRINGS };
  const result = await translateAndPublishLocaleKeys(theme.id, keys);
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
