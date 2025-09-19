require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme } = require('../src/services/shopify.service');

(async () => {
  assertRequired();
  const gid = (await getMainTheme()).id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "en") { key value }
      }
    }`,
    { id: gid }
  );
  const tr = data.translatableResource;
  const prefix = process.argv[2] || 'section.product.json';
  const rows = (tr?.translatableContent || []).filter(
    (r) => r.key.startsWith(prefix) && r.locale === 'nl' && r.value?.trim()
  );
  const en = new Map((tr?.translations || []).map((t) => [t.key, t.value]));
  console.log('Product template NL keys:', rows.length);
  for (const r of rows) {
    console.log('\n---', r.key);
    console.log('NL:', r.value.slice(0, 150).replace(/\s+/g, ' '));
    const ev = en.get(r.key);
    if (ev) console.log('EN:', ev.slice(0, 150).replace(/\s+/g, ' '));
    else console.log('EN: (missing)');
  }
})();
