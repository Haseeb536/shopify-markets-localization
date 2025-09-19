require('dotenv').config();
const { graphql, getMainTheme } = require('../src/services/shopify.service');

(async () => {
  const theme = await getMainTheme();
  const gid = theme.id;
  const queries = [
    `query { translatableResource(resourceId: "${gid}") { resourceId translatableContent { key value locale digest } } }`,
    `query { translatableResources(first: 3, resourceType: ONLINE_STORE_THEME) { edges { node { resourceId translatableContent { key locale } } } } }`,
  ];
  for (const q of queries) {
    try {
      const d = await graphql(q);
      console.log(JSON.stringify(d, null, 2).slice(0, 4000));
    } catch (e) {
      console.error(e.message);
    }
  }
})();
