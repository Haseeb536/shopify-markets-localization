require('dotenv').config();
const { assertRequired } = require('../src/config');
const { patchThemeSnippetStrings } = require('../src/services/themeSnippetStrings.service');

(async () => {
  try {
    assertRequired();
    const result = await patchThemeSnippetStrings();
    // eslint-disable-next-line no-console
    console.log('Patched theme snippets:', result);
    // eslint-disable-next-line no-console
    console.log('Next: npm run bulk:theme-translations (with worker running)');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
