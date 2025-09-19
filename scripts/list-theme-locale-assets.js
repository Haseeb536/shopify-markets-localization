require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/themeLocale.service');

(async () => {
  try {
    assertRequired();
    const theme = await getMainTheme();
    if (!theme?.id) throw new Error('No MAIN theme');
    const id = theme.id.split('/').pop();
    const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
    const res = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
      timeout: 60000,
    });
    const keys = (res.data.assets || [])
      .map((a) => a.key)
      .filter((k) => k && k.includes('locales/'))
      .sort();
    // eslint-disable-next-line no-console
    console.log('Theme:', theme.name, theme.id);
    // eslint-disable-next-line no-console
    console.log('Locale assets:\n', keys.join('\n'));
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
