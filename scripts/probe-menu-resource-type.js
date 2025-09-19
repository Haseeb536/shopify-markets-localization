require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');

const TYPES = [
  'MENU',
  'MENU_ITEM',
  'ONLINE_STORE_MENU',
  'ONLINE_STORE_MENU_ITEM',
  'LINK',
  'NAVIGATION',
];

(async () => {
  assertRequired();
  for (const resourceType of TYPES) {
    try {
      const data = await graphql(
        `query($type: TranslatableResourceType!) {
          translatableResources(first: 5, resourceType: $type) {
            edges {
              node {
                resourceId
                translatableContent { key value locale }
              }
            }
          }
        }`,
        { type: resourceType }
      );
      const edges = data?.translatableResources?.edges || [];
      console.log(resourceType, 'count', edges.length);
      if (edges[0]) {
        const c = edges[0].node.translatableContent?.[0];
        console.log('  sample', edges[0].node.resourceId, c?.key, c?.value);
      }
    } catch (e) {
      console.log(resourceType, 'ERR', e.message.slice(0, 80));
    }
  }
})();
