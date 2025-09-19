require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  const data = await graphql(
    `query($theme: ID!, $locale: String!) {
      translatableResource(resourceId: $theme) {
        translations(locale: $locale) { key value }
      }
    }`,
    { theme: theme.id, locale: 'fr' }
  );
  const bad = (data.translatableResource?.translations || []).filter((t) => {
    const v = String(t.value || '');
    return (
      (t.key.includes('product.json') || t.key.includes('footer-group')) &&
      (/<p>\.<\/p>/.test(v) || /<p>\.<\/p>/.test(v) || />\.<\/p>/.test(v) || /<p>\s*\.<\/p>/.test(v) || /Clients satisfaits<\/strong>\.<\/p>/.test(v))
    );
  });
  console.log('bad count', bad.length);
  for (const b of bad) console.log(b.key, '=>', b.value);
})();
