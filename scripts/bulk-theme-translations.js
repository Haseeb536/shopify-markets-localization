require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme } = require('../src/services/themeLocale.service');
const { enqueueTranslation } = require('../src/queues/enqueue');
const { getTranslationQueue } = require('../src/queues/translation.queue');

(async () => {
  try {
    assertRequired();
    const theme = await getMainTheme();
    if (!theme?.id) throw new Error('No MAIN theme found');

    await enqueueTranslation(
      'theme',
      { resourceGid: theme.id, topic: 'bulk-theme-translations' },
      { jobId: `bulk-theme-translations-${theme.id.split('/').pop()}` }
    );
    // eslint-disable-next-line no-console
    console.log('Queued theme Translations API job for', theme.id);
    // eslint-disable-next-line no-console
    console.log('Ensure npm run worker is running. This translates ~4600 theme strings (buttons, accordions, sections).');
    await getTranslationQueue().close();
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
