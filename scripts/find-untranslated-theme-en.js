require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme } = require('../src/services/shopify.service');

const DUTCH =
  /\b(verzending|retour|tevreden|klanten|naam|e-mail|meld|aanmel|bekijken|nodig|opnemen|gratis|werkdag|toepas|minpunten|aanbevolen|producten|performance|optimaliseer|geniet|ervaar|bekijk|privacy|voorwaarden|rechten|whats|betaal|delen|inlaat|oliekoeler|montage|koolstof|vermogen|bestelling|annuleren|ontvangst)\b/i;

(async () => {
  assertRequired();
  const gid = (await getMainTheme()).id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "en") { key value }
      }
    }`,
    { id: gid }
  );
  const tr = data.translatableResource;
  const nl = new Map(
    (tr?.translatableContent || [])
      .filter((c) => c.locale === 'nl' && c.value?.trim())
      .map((c) => [c.key, c.value])
  );
  const en = new Map((tr?.translations || []).map((t) => [t.key, t.value]));

  let n = 0;
  for (const [key, nlVal] of nl) {
    if (!/product\.json|footer-group|jt\.(product|contact|footer)/.test(key)) continue;
    const enVal = en.get(key);
    if (!enVal) {
      console.log('MISSING', key, '=>', nlVal.slice(0, 70).replace(/\s+/g, ' '));
      n++;
      continue;
    }
    if (DUTCH.test(enVal) && !DUTCH.test(nlVal) === false) {
      if (DUTCH.test(enVal)) {
        console.log('DUTCH_EN', key);
        console.log('  EN:', enVal.slice(0, 100).replace(/\s+/g, ' '));
        n++;
      }
    } else if (enVal === nlVal && DUTCH.test(nlVal)) {
      console.log('SAME_NL', key, '=>', nlVal.slice(0, 70).replace(/\s+/g, ' '));
      n++;
    }
  }
  console.log('\nTotal:', n);
})();
