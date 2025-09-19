/**
 * FR promo/footer badge blocks + EN/DE flagship polish.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
} = require('../src/services/shopify.service');
const { fixThemeProductStrings } = require('../src/services/fixThemeProductStrings.service');
const { applyGrammarQaPost } = require('../src/utils/grammarQa');
const { applyLocaleQaPost } = require('../src/utils/glossary');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');

assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

const PRODUCT_FR_KEYS = [
  'section.product.json.text_with_icons_FUUP7z.item_yD4bQd.content:1fnz6ftog083k',
  'section.product.json.text_with_icons_FUUP7z.item_7WgVRU.content:s5ja4oqgo348',
  'section.product.json.text_with_icons_FUUP7z.item_arhYTb.content:hrh1ku505i5m',
];

(async () => {
  const themeFix = await fixThemeProductStrings();
  const bodyRepair = await repairPublishedProductBodies([FLAGSHIP]);

  const tr = await fetchTranslatableResource(FLAGSHIP);
  const digest = (tr.translatableContent || []).find((c) => c.key === 'body_html')?.digest;

  const enData = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        en: translations(locale: "en") { key value }
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: FLAGSHIP }
  );
  let enBody = enData.translatableResource.en.find((t) => t.key === 'body_html')?.value || '';
  let deBody = enData.translatableResource.de.find((t) => t.key === 'body_html')?.value || '';
  enBody = applyLocaleQaPost(enBody, 'EN');
  deBody = applyGrammarQaPost(deBody, 'de');

  await registerTranslationsReliable(
    FLAGSHIP,
    [
      { locale: 'en', key: 'body_html', value: enBody, translatableContentDigest: digest },
      { locale: 'de', key: 'body_html', value: deBody, translatableContentDigest: digest },
    ],
    { batchSize: 2 }
  );

  const theme = themeFix.themeGid;
  const verify = await graphql(
    `query($theme: ID!, $locale: String!) {
      translatableResource(resourceId: $theme) {
        translations(locale: $locale) { key value }
      }
    }`,
    { theme, locale: 'fr' }
  );
  const fr = Object.fromEntries(
    (verify.translatableResource.translations || [])
      .filter((t) => PRODUCT_FR_KEYS.includes(t.key))
      .map((t) => [t.key.split('.').pop(), t.value])
  );

  const enCheck = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        en: translations(locale: "en") { key value }
        de: translations(locale: "de") { key value }
      }
    }`,
    { id: FLAGSHIP }
  );
  const enBodyLive = enCheck.translatableResource.en.find((t) => t.key === 'body_html')?.value || '';
  const deBodyLive = enCheck.translatableResource.de.find((t) => t.key === 'body_html')?.value || '';

  console.log(
    JSON.stringify(
      {
        themeFix,
        bodyRepair,
        frProductBadges: fr,
        enDirectMounting: enBodyLive.includes('<li>Direct mounting</li>'),
        deWieviel: !/Wieviel/i.test(deBodyLive),
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
