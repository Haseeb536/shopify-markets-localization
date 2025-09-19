require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');

const KEYS = [
  'product.form.add_to_cart',
  'section.product.json.main.content_VdNWWq.title:3l4bng5zoqkjy',
  'jt.product.trust_tuners',
];

(async () => {
  const theme = await getMainTheme();
  const gid = theme.id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "en") { key value outdated }
        translatableContent { key value locale }
      }
    }`,
    { id: gid }
  );
  const tr = data.translatableResource;
  const en = (tr.translations || []).filter((t) => KEYS.some((k) => t.key === k || t.key.startsWith('section.product.json')));
  console.log('EN translations (sample):');
  for (const t of en.slice(0, 15)) {
    console.log(t.key, '=>', String(t.value).slice(0, 80));
  }
  for (const k of KEYS) {
    const src = tr.translatableContent.find((c) => c.key === k && c.locale === 'nl');
    const trn = tr.translations.find((t) => t.key === k);
    console.log('\n', k);
    console.log('  nl:', src?.value?.slice(0, 60));
    console.log('  en:', trn?.value?.slice(0, 60));
  }
})();
