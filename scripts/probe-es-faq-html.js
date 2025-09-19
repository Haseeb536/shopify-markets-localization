require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const id = `gid://shopify/Product/${process.argv[2] || '10360900256091'}`;

(async () => {
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "es") { key value }
      }
    }`,
    { id }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const faqIdx = body.search(/preguntas frecuentes/i);
  console.log(body.slice(faqIdx, faqIdx + 1200));
})();
