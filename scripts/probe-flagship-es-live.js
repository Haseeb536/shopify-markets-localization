require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
const ID = 'gid://shopify/Product/10360905269595';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "es") { key value }
      }
    }`,
    { id: ID }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const carbon = (body.match(/fibra de carbono brillante/gi) || []).length;
  const faqMerge = /\*\*[^*]+\*\*[^<]*\*\*¿/.test(body) || /\?[^<]{0,8}\*\*¿/.test(body);
  console.log({ len: body.length, carbon, faqMerge });
  const idx = body.indexOf('Preguntas frecuentes');
  if (idx >= 0) console.log('FAQ snippet:', body.slice(idx, idx + 450));
  const feat = body.indexOf('Características');
  if (feat >= 0) console.log('Features:', body.slice(feat, feat + 350));
})();
