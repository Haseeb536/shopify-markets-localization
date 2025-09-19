require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const p = await graphql(
    `query { productByHandle(handle: "forge-short-shift-kit-seat-leon-en-skoda-octavia-1") { id title } }`
  );
  const id = p.productByHandle.id;
  const tr = await graphql(
    `query($id: ID!) {
      fr: translatableResource(resourceId: $id) { translations(locale: "fr") { key value } }
    }`,
    { id }
  );
  console.log('NL', p.productByHandle.title);
  console.log('FR title', tr.fr.translations.find((t) => t.key === 'title')?.value);
  const body = tr.fr.translations.find((t) => t.key === 'body_html')?.value || '';
  const m = body.match(/changement|Short Shift|levier/i);
  console.log('FR body has Short Shift:', /Short Shift/i.test(body));
  if (/changement|levier court/i.test(body)) console.log('body leak found');
})();
