require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const kanal = [];
  const shortShift = [];
  for (const gid of gids) {
    const p = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    if (/short shift/i.test(p.product.title)) {
      const t = await graphql(
        `query($id: ID!) { tr: translatableResource(resourceId: $id) { it: translations(locale: "it") { key value } fr: translations(locale: "fr") { key value } } }`,
        { id: gid }
      );
      shortShift.push({
        handle: p.product.handle,
        it: t.tr.it.find((r) => r.key === 'title')?.value,
        fr: t.tr.fr.find((r) => r.key === 'title')?.value,
      });
    }
    const it = await graphql(
      `query($id: ID!) { tr: translatableResource(resourceId: $id) { translations(locale: "it") { key value } } }`,
      { id: gid }
    );
    const title = it.tr.translations.find((r) => r.key === 'title')?.value || '';
    if (/\bKanal\b/i.test(title)) kanal.push({ handle: p.product.handle, title });
  }
  console.log('IT titles with Kanal:', kanal.length);
  kanal.forEach((k) => console.log(' ', k));
  console.log('\nShort Shift titles (IT/FR sample):');
  shortShift.forEach((s) => console.log(s.handle, '\n  IT:', s.it, '\n  FR:', s.fr));
})();
