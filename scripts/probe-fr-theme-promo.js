require('dotenv').config();
const { assertRequired } = require('../src/config');
const { getMainTheme, fetchTranslatableResource, graphql } = require('../src/services/shopify.service');
const { fetchThemeLocaleAsset } = require('../src/services/themeLocale.service');
assertRequired();

const NEEDLES = [/frais de port/i, /Clients satisfaits/i, /satisfaits/i, /Payer/i, /350/];

(async () => {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  console.log('theme', theme.id);

  const hits = [];
  for (const c of tr.translatableContent || []) {
    const val = String(c.value || '');
    if (NEEDLES.some((n) => n.test(val))) hits.push({ key: c.key, locale: c.locale, value: val.slice(0, 400) });
  }
  console.log('\n=== translatableContent hits', hits.length, '===');
  for (const h of hits) console.log(JSON.stringify(h, null, 2));

  const frJson = await fetchThemeLocaleAsset(theme.id, 'locales/fr.json').catch(() => ({}));
  const jtKeys = Object.entries(frJson).filter(([k]) => k.startsWith('jt.'));
  console.log('\n=== fr.json jt keys ===');
  for (const [k, v] of jtKeys) console.log(k, ':', v);

  for (const needle of ['frais de port', 'satisfaits', 'Payer']) {
    const data = await graphql(
      `query($theme: ID!, $locale: String!) {
        translatableResource(resourceId: $theme) {
          translations(locale: $locale) { key value }
        }
      }`,
      { theme: theme.id, locale: 'fr' }
    );
    const matches = (data.translatableResource?.translations || []).filter((t) =>
      String(t.value || '').toLowerCase().includes(needle.toLowerCase())
    );
    console.log(`\n=== FR translations containing "${needle}" (${matches.length}) ===`);
    for (const m of matches) console.log(m.key, '=>', m.value?.slice(0, 500));
  }
})();
