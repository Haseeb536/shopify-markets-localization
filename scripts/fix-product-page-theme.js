/**
 * Translate product-page lower sections + footer (icons, recommendations, contact, footer).
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');
const { translateResource } = require('../src/services/translation.service');
const { patchThemeContactAndFooter } = require('../src/services/themeContactPatch.service');
const { deployJtLocaleFallback } = require('../src/services/jtLocaleFallback.service');
const { registerProductPageEnglish } = require('../src/services/themeManualTranslate.service');

const KEY_PREFIXES = [
  'section.product.json.',
  'section.sections/footer-group.json.',
  'jt.contact.',
  'jt.footer.',
];

function matchesKey(key) {
  return KEY_PREFIXES.some((p) => key.startsWith(p));
}

(async () => {
  assertRequired();
  const patch = await patchThemeContactAndFooter();
  console.log('Patched assets:', patch.patched);
  const jtFb = await deployJtLocaleFallback();
  console.log('JT locale fallback:', jtFb);

  const theme = await getMainTheme();
  let result;
  try {
    result = await translateResource(
      theme.id,
      { topic: 'fix-product-page-theme' },
      matchesKey,
      null
    );
  } catch (e) {
    const quota =
      e.message?.includes('456') ||
      e.message?.includes('Quota') ||
      e.response?.data?.message === 'Quota exceeded';
    if (!quota) throw e;
    console.log('DeepL quota exceeded — registering English manually (no API).');
    result = await registerProductPageEnglish(theme.id);
  }

  console.log('Translation result:', result);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
