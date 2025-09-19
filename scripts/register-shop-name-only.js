require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  getMainTheme,
  fetchTranslatableResource,
  registerTranslationsReliable,
  fetchTranslationsMap,
} = require('../src/services/shopify.service');
assertRequired();

const KEY = 'header.general.shop_name';
const VALUE = 'JT Products';

(async () => {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const nlRow = (tr.translatableContent || []).find(
    (c) => c.key === KEY && String(c.locale || '').toLowerCase().startsWith('nl')
  );
  if (!nlRow?.digest) {
    console.error('No NL digest for', KEY);
    process.exit(1);
  }
  console.log('digest found', nlRow.digest.slice(0, 12));

  for (const locale of ['fr', 'it']) {
    const batch = [{ locale, key: KEY, value: VALUE, translatableContentDigest: nlRow.digest }];
    await registerTranslationsReliable(theme.id, batch, { batchSize: 1 });
    const map = await fetchTranslationsMap(theme.id, locale);
    console.log(locale, '=>', map.get(KEY) || '(still missing)');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
