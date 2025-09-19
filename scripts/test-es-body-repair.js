require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
const { applyGlossaryPost, loadGlossary } = require('../src/utils/glossary');
const { config } = require('../src/config');
const { toDeepLTarget } = require('../src/services/deepl.service');

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
  let fixed = applyProductBodyStructuralRepair(body, 'es');
  fixed = applyGlossaryPost(fixed, toDeepLTarget('es'), loadGlossary(config.paths.glossary));
  console.log('changed', body.trim() !== fixed.trim());
  console.log(
    'carbon',
    (body.match(/fibra de carbono brillante/gi) || []).length,
    '->',
    (fixed.match(/fibra de carbono brillante/gi) || []).length
  );
  const i = fixed.indexOf('Preguntas');
  console.log(fixed.slice(i, i + 420));
})();
