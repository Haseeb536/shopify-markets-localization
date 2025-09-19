require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, getMainTheme, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const RETURN_KEY = 'section.product.json.main.content_NXhqmi.content:2b7clfu88q4ht';
const DUTCH = /\b(verstelbare|siliconen|slangenset|vervanging|inlaat|koeler|actuator|zwart|blauw|rood|montage|set)\b/i;

(async () => {
  const theme = await getMainTheme();
  const d = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
        translations(locale: "fr") { key value }
      }
    }`,
    { id: theme.id }
  );
  const src = d.translatableResource.translatableContent.find((c) => c.key === RETURN_KEY);
  const fr = d.translatableResource.translations.find((t) => t.key === RETURN_KEY);
  console.log('NL source len:', src?.value?.length);
  console.log('FR return:', fr?.value ? fr.value.slice(0, 300) : '(MISSING)');

  const gids = await listAllProductGids();
  const leaks = [];
  for (const gid of gids) {
    for (const loc of ['de', 'es', 'fr', 'en', 'it']) {
      const p = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: loc }
      );
      const title = p.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
      if (DUTCH.test(title)) leaks.push({ gid, loc, title });
    }
  }
  console.log('\nDutch leaks in titles:', leaks.length);
  for (const r of leaks.slice(0, 25)) console.log(r.loc, r.title);
})();
