require('dotenv').config();
const { getMainTheme, graphql } = require('../src/services/shopify.service');
const KEYS = [
  'section.product.json.main.content_VdNWWq.title:3l4bng5zoqkjy',
  'section.product.json.main.content_VdNWWq.content:15mlt1zj681fr',
  'section.product.json.main.content_NXhqmi.title:2ap617qaw1y88',
  'section.product.json.main.content_NXhqmi.content:2b7clfu88q4ht',
];
(async () => {
  const theme = await getMainTheme();
  for (const loc of ['en', 'de', 'es', 'it', 'fr', 'nl']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: theme.id, l: loc }
    );
    console.log('\n===', loc, '===');
    for (const k of KEYS) {
      const v = d.translatableResource.translations.find((t) => t.key === k)?.value || '(missing)';
      console.log(k.split('.').pop(), ':', String(v).slice(0, 120));
    }
  }
})();
