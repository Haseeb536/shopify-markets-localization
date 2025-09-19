require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme, Gid } = require('../src/services/shopify.service');

const NEEDLES = ['Toepasbaarheid', 'retourneren', 'Betaal nu', 'tevreden klanten', 'Naam', 'E-mailadres', 'Inlaatkanaal', 'Oliekoeler'];
const productId = process.argv[2];

(async () => {
  assertRequired();
  const resources = [{ label: 'theme', id: (await getMainTheme()).id }];
  if (productId) resources.push({ label: 'product', id: Gid.product(productId) });

  for (const { label, id } of resources) {
    console.log('\n===', label, id, '===');
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
    const nl = (tr?.translatableContent || []).filter((r) => r.locale === 'nl' && r.value);
    const enMap = new Map((tr?.translations || []).map((t) => [t.key, t.value]));
    for (const r of nl) {
      if (!NEEDLES.some((n) => r.value.includes(n))) continue;
      const en = enMap.get(r.key);
      console.log('\nKEY:', r.key);
      console.log('NL:', r.value.slice(0, 100).replace(/\s+/g, ' '));
      console.log('EN:', en ? en.slice(0, 100).replace(/\s+/g, ' ') : '(missing)');
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
