require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme } = require('../src/services/themeLocale.service');
const { enqueueTranslation } = require('../src/queues/enqueue');
const { getTranslationQueue } = require('../src/queues/translation.queue');

const sourceAssetKey = process.env.THEME_SOURCE_ASSET || 'locales/nl.json';

(async () => {
  try {
    assertRequired();
    const theme = await getMainTheme();
    if (!theme?.id) {
      throw new Error('No MAIN theme found');
    }
    await enqueueTranslation(
      'theme-locale',
      { themeGid: theme.id, sourceAssetKey },
      { jobId: `bulk-theme-locale-${theme.id.split('/').pop()}` }
    );
    // eslint-disable-next-line no-console
    console.log('Queued theme-locale job for', theme.id, sourceAssetKey);
    await getTranslationQueue().close();
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
