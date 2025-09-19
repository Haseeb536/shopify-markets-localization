require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const POLO = 'gid://shopify/Product/10360888623451';
const FABIA = 'gid://shopify/Product/10360899830107';
const LOCALES = [config.locales.source, ...config.locales.targets];

async function titlesFor(id) {
  const out = {};
  for (const loc of LOCALES) {
    const t = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id, l: loc }
    );
    out[loc] =
      t.translatableResource.translations.find((x) => x.key === 'title')?.value || '(missing)';
  }
  const src = await graphql(`query($id: ID!) { product(id: $id) { title } }`, { id });
  return { source: src.product.title, locales: out };
}

(async () => {
  for (const [label, id] of [
    ['Polo VW', POLO],
    ['Fabia Intake', FABIA],
  ]) {
    const r = await titlesFor(id);
    console.log(`\n=== ${label} ===`);
    console.log('SRC:', r.source);
    for (const loc of LOCALES) {
      console.log(`${loc.toUpperCase()}:`, r.locales[loc]);
    }
  }
})();
