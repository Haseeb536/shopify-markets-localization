require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');
const needle = process.argv[2] || 'Gratis verzending vanaf';
(async () => {
  const data = await graphql(
    `query ThemeTrans($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
      }
    }`,
    { id: (await getMainTheme()).id }
  );
  for (const c of data.translatableResource.translatableContent) {
    if (c.locale === 'nl' && c.value && c.value.includes(needle)) {
      console.log(c.key);
      console.log(' ', c.value.replace(/\s+/g, ' ').slice(0, 120));
    }
  }
})();
