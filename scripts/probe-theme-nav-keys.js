require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslatableResource } = require('../src/services/shopify.service');

const NEEDLES = ['My Store', 'Home', 'Categories', 'Contact', 'Catalog', 'Cart'];

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  for (const needle of NEEDLES) {
    const hits = (tr.translatableContent || []).filter(
      (c) => String(c.value || '').trim() === needle || String(c.value || '').includes(needle)
    );
    console.log(`\n"${needle}" (${hits.length} hits):`);
    for (const h of hits.slice(0, 8)) {
      console.log(' ', h.locale, h.key, '=', String(h.value).slice(0, 60));
    }
  }
})();
