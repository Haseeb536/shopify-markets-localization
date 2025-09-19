require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, Gid, getMainTheme } = require('../src/services/shopify.service');

const PREFIXES = [
  'section.product.json',
  'section.sections/footer-group.json',
];

const PAGE_STRINGS = [
  'Betaal',
  'verzending',
  'tevreden',
  'Naam',
  'E-mailadres',
  'Klantenservice',
  'performance',
  'Aanbevolen',
  'Hulp nodig',
  'Whatsapp',
  'nieuwsbrief',
  'Bezorg',
  'Gratis',
  'Tuning',
];

(async () => {
  assertRequired();
  const themeId = (await getMainTheme()).id;
  const data = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "en") { key value }
      }
    }`,
    { id: themeId }
  );
  const tr = data.translatableResource;
  const nl = (tr?.translatableContent || []).filter(
    (c) =>
      c.locale === 'nl' &&
      PREFIXES.some((p) => c.key.startsWith(p)) &&
      PAGE_STRINGS.some((s) => c.value.includes(s))
  );
  const enMap = new Map((tr?.translations || []).map((t) => [t.key, t.value]));

  console.log('Product-page theme keys matching page strings:', nl.length);
  for (const c of nl) {
    const en = enMap.get(c.key);
    const same = en && en.trim() === c.value.trim();
    const dutchEn = en && /Betaal|verzending|tevreden|Naam|E-mailadres|Klantenservice|Aanbevolen|Hulp|nieuwsbrief|Gratis verzending|Tuning advies/i.test(en);
    if (!en || same || dutchEn) {
      console.log('\n---', c.key);
      console.log('NL:', c.value.slice(0, 120).replace(/\s+/g, ' '));
      console.log('EN:', en ? en.slice(0, 120).replace(/\s+/g, ' ') : '(missing)');
      if (same) console.log('(EN same as NL)');
      if (dutchEn) console.log('(EN still Dutch)');
    }
  }

  const pdata = await graphql(
    `query($id: ID!, $loc: String!) {
      translatableResource(resourceId: $id) {
        translations(locale: $loc) { key value }
      }
    }`,
    { id: Gid.product('10360905269595'), loc: 'en' }
  );
  const body = pdata.translatableResource?.translations?.find((t) => t.key === 'body_html')?.value || '';
  const broken = body.match(/carbon fibre\?\*\*How/g);
  console.log('\nProduct body FAQ broken markup:', broken ? 'YES' : 'no');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
