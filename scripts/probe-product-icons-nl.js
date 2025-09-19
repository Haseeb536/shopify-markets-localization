require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslatableResource } = require('../src/services/shopify.service');
assertRequired();

const KEYS = [
  'section.product.json.text_with_icons_FUUP7z.item_yD4bQd.content:1fnz6ftog083k',
  'section.product.json.text_with_icons_FUUP7z.item_7WgVRU.content:s5ja4oqgo348',
  'section.product.json.text_with_icons_FUUP7z.item_arhYTb.content:hrh1ku505i5m',
  'section.product.json.text_with_icons_FUUP7z.item_eVdMiY.content:38v1m0lopuvjo',
];

(async () => {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  for (const key of KEYS) {
    const row = (tr.translatableContent || []).find((c) => c.key === key);
    console.log('\nKEY:', key);
    console.log('NL:', row?.value);
  }
})();
