require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslationsMap } = require('../src/services/shopify.service');
const { fetchThemeLocaleAsset, flattenStringLeaves } = require('../src/services/themeLocale.service');

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const it = await fetchThemeLocaleAsset(theme.id, 'locales/it.json');
  const flat = flattenStringLeaves(it);
  const keys = Object.keys(flat);
  console.log('it.json string keys:', keys.length);
  for (const k of keys) {
    if (/contact|footer|jt|whatsapp|newsletter/i.test(k)) {
      console.log(k, '=>', flat[k].slice(0, 60));
    }
  }
  const jtKeys = ['jt.contact.whatsapp_title', 'jt.contact.reply_one_day', 'jt.contact.email_title'];
  for (const k of jtKeys) {
    const tr = await fetchTranslationsMap(theme.id, 'it');
    console.log('API it', k, '=>', tr.get(k)?.slice(0, 60) || '(missing)');
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
