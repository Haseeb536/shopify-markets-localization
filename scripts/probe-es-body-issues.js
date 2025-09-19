require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
assertRequired();

(async () => {
  const d = await graphql(
    `query($id: ID!, $l: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $l) { key value }
      }
    }`,
    { id: 'gid://shopify/Product/10360905269595', l: 'es' }
  );
  const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const repaired = applyProductBodyStructuralRepair(body, 'es');
  console.log('changed', repaired !== body);
  console.log('dup filter before', (body.match(/Filtro de aire lavable/gi) || []).length);
  console.log('dup filter after', (repaired.match(/Filtro de aire lavable/gi) || []).length);
  console.log('broken li before', /<li>[^<]+<li>/i.test(body));
  console.log('broken li after', /<li>[^<]+<li>/i.test(repaired));
  const feat = repaired.match(/Características[\s\S]{0,500}/i);
  if (feat) console.log('features:', feat[0].replace(/\s+/g, ' '));
  console.log('h3 in body', (body.match(/<h3/gi) || []).length);
})();
