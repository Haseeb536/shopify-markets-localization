require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme, fetchTranslationsMap } = require('../src/services/shopify.service');
assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const LOCALES = ['en', 'de', 'fr', 'it', 'es'];

(async () => {
  const theme = await getMainTheme();
  console.log('=== HEADER shop_name ===');
  for (const loc of ['nl', ...LOCALES]) {
    const map = await fetchTranslationsMap(theme.id, loc);
    console.log(loc, map.get('header.general.shop_name') || '(missing)');
  }

  console.log('\n=== FR return block ===');
  const frReturn = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "fr") { key value }
      }
    }`,
    { id: theme.id }
  );
  const keys = frReturn.translatableResource.translatableContent.filter((c) =>
    /content_NXhqmi|content_qVRxey/.test(c.key)
  );
  for (const c of keys) console.log(c.locale || 'src', c.key.split('.').pop(), String(c.value).slice(0, 120));
  for (const t of frReturn.translatableResource.translations) {
    console.log('fr', t.key.split('.').pop(), String(t.value).slice(0, 200));
  }

  console.log('\n=== FLAGSHIP bodies snippets ===');
  for (const loc of LOCALES) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FLAGSHIP, l: loc }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    const title = d.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
    console.log('\n', loc, 'title:', title);
    if (/Der |Das |staffa|Intake|13cv|13 ch|\.\s*\.|Siliconen|Verstelbare/i.test(body)) {
      const hits = [...body.matchAll(/Der [^<]{0,40}|Das [^<]{0,40}|staffa|Siliconen[^<]{0,30}|13cv|13 ch|\.{2,}/gi)].map((m) => m[0]);
      console.log('  body hits:', hits.slice(0, 8));
    }
    const faq = body.match(/FAQ|vragen|frecuentes|frequenti|fréquentes[\s\S]{0,800}/i);
    if (faq) console.log('  faq tail:', faq[0].replace(/\s+/g, ' ').slice(0, 300));
  }
})();
