require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslatableResource } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const all = tr.translatableContent || [];
  for (const prefix of ['content_qVRxey', 'content_qaGgkC', 'delivery_info', 'plus_minus']) {
    console.log('\n===', prefix, '===');
    for (const c of all.filter((x) => x.key.includes(prefix))) {
      console.log(c.locale || 'default', c.key.split('.').pop(), '=>', String(c.value).slice(0, 300));
    }
  }
})();
