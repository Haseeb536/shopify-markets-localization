require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme } = require('../src/services/shopify.service');

(async () => {
  assertRequired();
  const id = (await getMainTheme()).id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "en") { key value }
      }
    }`,
    { id }
  );
  const tr = data.translatableResource;
  const nl = (tr?.translatableContent || []).filter(
    (c) => c.locale === 'nl' && c.key.startsWith('section.product.json') && c.value?.trim()
  );
  const enMap = new Map((tr?.translations || []).map((t) => [t.key, t.value]));
  const dutch = /\b(je |het |de |een |voor |vanaf |verzending|retour|tevreden|klanten|naam|e-mail|meld |aanmel|bekijken|nodig|opnemen|betaal|delen|gratis|werkdag|toepas|aanbevolen|inlaat|hulp|whats|nieuwsbrief|tuning advies|bezorg)\b/i;

  let missing = 0;
  let same = 0;
  let stillDutch = 0;
  for (const c of nl) {
    const en = enMap.get(c.key);
    if (!en) {
      missing++;
      if (/icon|trust|newsletter|contact|complementary|text_with|payment|shipping|title|content/i.test(c.key)) {
        console.log('MISSING', c.key, '|', c.value.slice(0, 80).replace(/\s+/g, ' '));
      }
    } else if (en.trim() === c.value.trim()) {
      same++;
      if (dutch.test(c.value) || /Reviews|Payment/i.test(c.value)) {
        console.log('SAME', c.key, '|', c.value.slice(0, 60));
      }
    } else if (dutch.test(en)) {
      stillDutch++;
      console.log('DUTCH-EN', c.key);
      console.log('  NL:', c.value.slice(0, 80));
      console.log('  EN:', en.slice(0, 80));
    }
  }
  console.log('\nTotals:', nl.length, 'nl keys | missing', missing, '| same', same, '| en still dutch', stillDutch);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
