require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const gid = 'gid://shopify/Product/10360893505883';
(async () => {
  const d = await graphql(
    `query($id: ID!) {
      product(id: $id) { title }
      translatableResource(resourceId: $id) {
        nl: translatableContent { key value }
        en: translations(locale: "en") { key value }
        de: translations(locale: "de") { key value }
        fr: translations(locale: "fr") { key value }
      }
    }`,
    { id: gid }
  );
  const t = (loc) => d.translatableResource[loc].find((x) => x.key === 'title')?.value;
  console.log('NL', t('nl'));
  console.log('EN', t('en'));
  console.log('DE', t('de'));
  console.log('FR', t('fr'));
})();
