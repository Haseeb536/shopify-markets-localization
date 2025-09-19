require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
const ID = 'gid://shopify/Product/10360907989339';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "fr") { key value }
      }
    }`,
    { id: ID }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  console.log({
    len: body.length,
    clients: (body.match(/clients?\s+satisfaits?/gi) || []).length,
    whatsapp: (body.match(/whatsapp/gi) || []).length,
    faqPage: (body.match(/FAQPage/gi) || []).length,
    h2: (body.match(/<h2/gi) || []).length,
    merged: /\?[^<]{0,40}(Comment|Pourquoi)/i.test(body),
    dots: (body.match(/\?\s*\./g) || []).length,
    dutch: /Verwachte levering|Gemaakt in het/i.test(body),
  });
})();
