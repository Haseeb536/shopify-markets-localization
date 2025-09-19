require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const {
  applyProductTitleLocalePost,
  needsTitleReprocessing,
} = require('../src/utils/productTitle');
const { toDeepLTarget } = require('../src/services/deepl.service');
const {
  graphql,
  listAllProductGids,
  fetchTranslatableResource,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');
assertRequired();

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

(async () => {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l));
  const gids = await listAllProductGids();
  let needs = 0;

  for (const gid of gids) {
    const tr = await fetchTranslatableResource(gid);
    const titleRow = (tr.translatableContent || []).find((c) => c.key === 'title' && c.digest);
    if (!titleRow) continue;
    const nlTitle = titleRow.value;

    for (const locale of targets) {
      const data = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: locale }
      );
      const existing =
        data.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
      let title = existing;
      if (needsTitleReprocessing(title, locale, nlTitle)) title = nlTitle;
      if (!title?.trim()) continue;
      let value = applyGlossaryPost(title, toDeepLTarget(locale), glossaryMap);
      value = applyGlossaryPost(value, toDeepLTarget(locale), glossaryMap);
      value = applyProductTitleLocalePost(value, locale);
      const existingTrim = existing.trim();
      if (!value?.trim()) continue;
      if (value.trim() === title.trim() && existingTrim) continue;
      if (existingTrim && value.trim() === existingTrim) continue;
      needs += 1;
      console.log(`${gid.split('/').pop()} [${locale}]`);
      console.log(`  was: ${existing || '(missing)'}`);
      console.log(`  want: ${value}`);
    }
  }
  console.log(`\nTotal pending: ${needs}`);
})();
