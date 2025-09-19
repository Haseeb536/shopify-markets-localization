require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
assertRequired();

const ID = 'gid://shopify/Product/10360905269595';
const LOCALES = ['en', 'de', 'fr', 'it', 'es'];

function faqIssues(body) {
  const mergedStrong = /<strong>[^<]+\?<\/strong>[^<]{0,80}<strong>/i.test(body);
  const gluedQuestions = /\?[^<]{0,30}(?:How|What|Was|Wie|Comment|Pourquoi|Quanto|Come|¿)/i.test(body);
  const strayDot = /\?\s*\./.test(body);
  const dupAnswer = /(<strong>[^<]+<\/strong>[^<]+)\1/i.test(body);
  return { mergedStrong, gluedQuestions, strayDot, dupAnswer };
}

(async () => {
  for (const loc of LOCALES) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: ID, l: loc }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    const idx = body.search(/FAQ|frequen|gestellte|Questions|Preguntas/i);
    const snippet = idx >= 0 ? body.slice(idx, idx + 600) : body.slice(-600);
    const before = faqIssues(body);
    const repaired = applyProductBodyStructuralRepair(body, loc);
    const after = faqIssues(repaired);
    const faqIdx = repaired.search(/FAQ|frequen|gestellte|Questions|Preguntas/i);
    const repairedSnippet =
      faqIdx >= 0 ? repaired.slice(faqIdx, faqIdx + 500) : repaired.slice(-500);
    console.log(`\n=== ${loc.toUpperCase()} ===`);
    console.log('before', before, 'after', after, 'changed', repaired !== body);
    console.log(repairedSnippet.replace(/\s+/g, ' ').slice(0, 450));
  }
})();
