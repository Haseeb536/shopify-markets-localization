require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const id = `gid://shopify/Product/${process.argv[2] || '10360900256091'}`;

(async () => {
  for (const loc of ['nl', 'en', 'es']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
          translatableContent { key value locale }
        }
      }`,
      { id, l: loc }
    );
    let body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value;
    if (!body && loc === 'nl') {
      body = d.translatableResource.translatableContent.find((c) => c.key === 'body_html')?.value;
    }
    const qs = [...String(body || '').matchAll(/<strong>([^<]+)<\/strong>/gi)]
      .map((m) => m[1].trim())
      .filter((q) => q.includes('?') || q.includes('¿'));
    console.log(`\n${loc.toUpperCase()} questions:`);
    qs.forEach((q) => console.log(' ', JSON.stringify(q)));
  }
})();
