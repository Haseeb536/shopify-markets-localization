require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const theme = await getMainTheme();
  const d = await graphql(
    `query ThemeFr($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "fr") { key value }
      }
    }`,
    { id: theme.id }
  );
  const v = d.translatableResource.translations.find((t) =>
    t.key.includes('NXhqmi.content')
  )?.value;
  console.log('len', v?.length);
  console.log(v);
  console.log('has policy', /Cette politique/.test(v || ''));
})();
