require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  graphql,
  fetchTranslatableResource,
  registerTranslationsReliable,
} = require('../src/services/shopify.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  const tr = await fetchTranslatableResource(FLAGSHIP);
  const row = (tr.translatableContent || []).find((c) => c.key === 'body_html' && c.digest);
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "en") { key value }
      }
    }`,
    { id: FLAGSHIP }
  );
  let body = data.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
  const before = body;
  body = body.replace(/<li>direct mounting<\/li>/gi, '<li>Direct mounting</li>');
  if (body === before) {
    console.log(JSON.stringify({ changed: false }));
    return;
  }
  await registerTranslationsReliable(
    FLAGSHIP,
    [{ locale: 'en', key: 'body_html', value: body, translatableContentDigest: row.digest }],
    { batchSize: 1 }
  );
  console.log(JSON.stringify({ changed: true }));
})();
