require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { graphql, fetchTranslatableResource } = require('../src/services/shopify.service');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const {
  applyProductTitleLocalePost,
  fixKitWordOrderInTitle,
  fixDutchEnInTitle,
  fixFrenchTitlePolish,
  fixTitleTerminologyPost,
  titleHasTerminologyBug,
} = require('../src/utils/productTitle');
const { toDeepLTarget } = require('../src/services/deepl.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
assertRequired();

const gid = 'gid://shopify/Product/10360903237979';

function pipeline(title, locale, nlTitle) {
  const glossaryMap = loadGlossary(config.paths.glossary);
  let value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
  value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
  value = fixDutchEnInTitle(value, locale);
  value = fixKitWordOrderInTitle(value, locale);
  value = applyProductTitleLocalePost(value, locale);
  value = fixFrenchTitlePolish(value, locale);
  value = fixTitleTerminologyPost(value, locale, nlTitle);
  value = fixKitWordOrderInTitle(value, locale);
  return value;
}

(async () => {
  const tr = await fetchTranslatableResource(gid);
  const nlTitle = tr.translatableContent.find((c) => c.key === 'title')?.value;
  const de = await graphql(
    `query($id: ID!) { translatableResource(resourceId: $id) { de: translations(locale: "de") { key value } } }`,
    { id: gid }
  );
  const deTitle = de.translatableResource.de.find((t) => t.key === 'title')?.value;
  console.log('NL:', nlTitle);
  console.log('DE existing:', deTitle);
  console.log('titleHasTerminologyBug:', titleHasTerminologyBug(deTitle, 'de', nlTitle));
  console.log('pipeline(deTitle):', pipeline(deTitle, 'de', nlTitle));
  console.log('pipeline(nlTitle):', pipeline(nlTitle, 'de', nlTitle));

  const r = await fixAllProductTitlesWithGlossary([gid]);
  console.log('fix result:', r);
  const de2 = await graphql(
    `query($id: ID!) { translatableResource(resourceId: $id) { de: translations(locale: "de") { key value } } }`,
    { id: gid }
  );
  console.log('DE after:', de2.translatableResource.de.find((t) => t.key === 'title')?.value);
})();
