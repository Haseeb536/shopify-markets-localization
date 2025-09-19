require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const p = await graphql(`query {
    productByHandle(handle: "forge-short-shift-kit-seat-leon-en-skoda-octavia-1") {
      id title seo { title description }
      metafields(first: 10) { edges { node { namespace key value } } }
    }
  }`);
  const id = p.productByHandle.id;
  const tr = await graphql(
    `query($id: ID!) { fr: translatableResource(resourceId: $id) { translations(locale: "fr") { key value } } }`,
    { id }
  );
  console.log('product.title NL:', p.productByHandle.title);
  console.log('seo.title:', p.productByHandle.seo?.title);
  console.log('FR translatable title:', tr.fr.translations.find((t) => t.key === 'title')?.value);
})();
