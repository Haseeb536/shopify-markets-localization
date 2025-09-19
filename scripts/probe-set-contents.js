require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const ID = 'gid://shopify/Product/10360905269595';

(async () => {
  for (const loc of ['nl', 'en', 'it', 'es', 'de', 'fr']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value locale }
          translations(locale: $l) { key value }
        }
      }`,
      { id: ID, l: loc }
    );
    const tr = d.translatableResource;
    let body =
      tr.translations.find((t) => t.key === 'body_html')?.value ||
      tr.translatableContent.find((c) => c.key === 'body_html' && c.locale === loc)?.value ||
      tr.translatableContent.find((c) => c.key === 'body_html')?.value ||
      '';
    const m = body.match(/<h2[^>]*>[^<]*(?:Inhoud|Contenido|Contenuto|Contents|Inhalt|Contenu)[^<]*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i);
    console.log(`\n${loc}:`, m ? m[1].replace(/\s+/g, ' ').trim() : '(no set block)');
  }
})();
