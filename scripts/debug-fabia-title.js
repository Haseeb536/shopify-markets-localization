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
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');
assertRequired();

const FABIA = 'gid://shopify/Product/10335289803099';

(async () => {
  const published = await getShopPublishedLocaleCodes();
  console.log('published', published);
  const glossaryMap = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(FABIA);
  const titleRow = tr.translatableContent.find((c) => c.key === 'title' && c.digest);
  const nlTitle = titleRow.value;
  console.log('source', nlTitle);

  for (const locale of config.locales.targets) {
    const data = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FABIA, l: locale }
    );
    const existing =
      data.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
    let title = existing;
    if (needsTitleReprocessing(title, locale, nlTitle)) title = nlTitle;
    let value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
    value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
    value = applyProductTitleLocalePost(value, locale);
    const skip1 = !value?.trim() || value.trim() === title.trim();
    const skip2 = existing.trim() && value.trim() === existing.trim();
    console.log(locale, {
      existing: existing || '(missing)',
      repro: needsTitleReprocessing(existing, locale, nlTitle),
      restruct: needsForgeTitleRestructure(existing),
      value,
      skip: skip1 || skip2,
    });
    if (!skip1 && !skip2 && published.map((l) => l.toLowerCase()).includes(locale)) {
      await registerTranslationsReliable(
        FABIA,
        [{ locale, key: 'title', value, translatableContentDigest: titleRow.digest }],
        { batchSize: 1 }
      );
      console.log('  registered', locale);
    }
  }
})();
