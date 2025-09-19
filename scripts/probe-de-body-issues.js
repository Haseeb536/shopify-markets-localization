require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = {
  g16e: 'gid://shopify/Product/10360905269595',
  suzuki: 'gid://shopify/Product/10360906613083',
  polo: 'gid://shopify/Product/10360906187099',
};

(async () => {
  for (const [name, id] of Object.entries(IDS)) {
    const d = await graphql(
      `query($id: ID!) { tr: translatableResource(resourceId: $id) { translations(locale: "de") { key value } } }`,
      { id }
    );
    const body = d.tr.translations.find((t) => t.key === 'body_html')?.value || '';
    const m = body.match(/<p>[\s\S]{0,300}/);
    console.log('\n', name, m?.[0]);
  }
})();
