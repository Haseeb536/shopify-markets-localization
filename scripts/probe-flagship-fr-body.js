require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
const ID = 'gid://shopify/Product/10360905269595';
(async () => {
  const d = await graphql(
    `query($id: ID!) { translatableResource(resourceId: $id) { translations(locale: "fr") { key value } } }`,
    { id: ID }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const checks = {
    len: body.length,
    faqMerge: /(\?)\s*(Comment|Pourquoi)/i.test(body),
    dupClients: (body.match(/clients?\s+satisfaits?/gi) || []).length,
    dupWhatsapp: (body.match(/whatsapp/gi) || []).length,
    dupFaqJson: (body.match(/FAQPage/gi) || []).length,
    dutchDelivery: /Verwachte levering/i.test(body),
    junDates: /\d+\s+jun\b/i.test(body),
    randomDots: /\?\s*\./.test(body),
  };
  console.log(checks);
  console.log('snippet:', body.slice(0, 500));
})();
