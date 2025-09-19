require('dotenv').config();
const fs = require('fs');
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';

(async () => {
  for (const loc of ['de', 'fr', 'en', 'it', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FLAGSHIP, l: loc }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    fs.writeFileSync(`data/flagship-body-${loc}.html`, body);
    console.log(loc, body.length, body.slice(0, 400).replace(/\s+/g, ' '));
  }
})();
