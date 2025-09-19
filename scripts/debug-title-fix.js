require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const {
  applyProductTitleLocalePost,
  needsTitleReprocessing,
  needsForgeTitleRestructure,
} = require('../src/utils/productTitle');
const { toDeepLTarget } = require('../src/services/deepl.service');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
} = require('../src/services/shopify.service');
assertRequired();

const POLO = 'gid://shopify/Product/10360888623451';
const LOCALES = config.locales.targets;

(async () => {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(POLO);
  const titleRow = tr.translatableContent.find((c) => c.key === 'title' && c.digest);
  const nlTitle = titleRow.value;

  for (const locale of LOCALES) {
    const data = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: POLO, l: locale }
    );
    const existing =
      data.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
    const repro = needsTitleReprocessing(existing, locale, nlTitle);
    const restruct = needsForgeTitleRestructure(existing);
    let title = existing;
    if (needsTitleReprocessing(title, locale, nlTitle)) title = nlTitle;
    let value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
    value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
    value = applyProductTitleLocalePost(value, locale);
    const skip =
      !value?.trim() ||
      value.trim() === title.trim() ||
      (existing.trim() && value.trim() === existing.trim());
    console.log(`\n${locale}: existing=${existing || '(missing)'}`);
    console.log(`  repro=${repro} restruct=${restruct}`);
    console.log(`  value=${value}`);
    console.log(`  skip=${skip}`);
    if (!skip) {
      await registerTranslationsReliable(
        POLO,
        [{ locale, key: 'title', value, translatableContentDigest: titleRow.digest }],
        { batchSize: 1 }
      );
      console.log('  REGISTERED');
    }
  }
})();
