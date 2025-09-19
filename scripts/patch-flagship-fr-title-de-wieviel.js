/**
 * FR flagship title + DE Wieviel spelling.
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
} = require('../src/services/shopify.service');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const {
  applyProductTitleLocalePost,
  fixFrenchTitlePolish,
} = require('../src/utils/productTitle');
const { applyGrammarQaPost } = require('../src/utils/grammarQa');
const { toDeepLTarget } = require('../src/services/deepl.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');

assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const FR_TITLE = 'Admission en fibre de carbone Forge pour Toyota Yaris GR G16E';

(async () => {
  const glossary = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(FLAGSHIP);
  const titleRow = (tr.translatableContent || []).find((c) => c.key === 'title' && c.digest);
  const bodyRow = (tr.translatableContent || []).find((c) => c.key === 'body_html' && c.digest);
  const nlTitle = (tr.translatableContent || []).find((c) => c.key === 'title')?.value || '';

  let frTitle = applyGlossaryPost(nlTitle, 'FR', glossary);
  frTitle = applyProductTitleLocalePost(frTitle, 'fr');
  frTitle = fixFrenchTitlePolish(frTitle, 'fr');

  await registerTranslationsReliable(
    FLAGSHIP,
    [{ locale: 'fr', key: 'title', value: frTitle, translatableContentDigest: titleRow.digest }],
    { batchSize: 1 }
  );

  const deBodyData = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "de") { key value }
      }
    }`,
    { id: FLAGSHIP }
  );
  let deBody = deBodyData.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  deBody = applyGrammarQaPost(deBody, 'de');

  await registerTranslationsReliable(
    FLAGSHIP,
    [{ locale: 'de', key: 'body_html', value: deBody, translatableContentDigest: bodyRow.digest }],
    { batchSize: 1 }
  );

  const titlePass = await fixAllProductTitlesWithGlossary();
  const bodyPass = await repairPublishedProductBodies([FLAGSHIP]);

  const verify = await graphql(
    `query($id: ID!) {
      fr: translatableResource(resourceId: $id) {
        title: translations(locale: "fr") { key value }
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: FLAGSHIP }
  );
  const frLive = verify.fr.title.find((t) => t.key === 'title')?.value;
  const deLive = verify.fr.de.find((t) => t.key === 'body_html')?.value || '';

  console.log(
    JSON.stringify(
      {
        frTitle: { expected: FR_TITLE, live: frLive, match: frLive === FR_TITLE },
        deWieviel: !/Wieviel/i.test(deLive),
        titlePass,
        bodyPass,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
