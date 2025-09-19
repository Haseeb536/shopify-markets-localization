require('dotenv').config();
const { assertRequired } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { graphql } = require('../src/services/shopify.service');
assertRequired();
clearGlossaryCaches();

const gid = 'gid://shopify/Product/10360899043675';
(async () => {
  console.log(await fixAllProductTitlesWithGlossary([gid]));
  const d = await graphql(
    `query($id: ID!) { translatableResource(resourceId: $id) { it: translations(locale: "it") { key value } } } }`,
    { id: gid }
  );
  console.log('IT title:', d.translatableResource.it.find((x) => x.key === 'title')?.value);
})();
