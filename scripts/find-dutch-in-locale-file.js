require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  getMainTheme,
  fetchThemeLocaleAsset,
  resolveThemeLocaleAssetKey,
  listThemeLocaleAssetKeys,
  flattenStringLeaves,
} = require('../src/services/themeLocale.service');

const locale = (process.argv[2] || 'en').toLowerCase().split('-')[0];
const DUTCH =
  /\b(je |het |de |een |voor |van |naam|e-mail|meld|aanmel|bekijken|verzending|retour|klanten|producten|whats|betaal|gratis|werkdag|opties|zwart|blauw|rood|kies)\b/i;

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const keys = await listThemeLocaleAssetKeys(theme.id);
  const assetKey = resolveThemeLocaleAssetKey(locale, keys);
  const json = await fetchThemeLocaleAsset(theme.id, assetKey);
  const flat = flattenStringLeaves(json);
  let n = 0;
  console.log('Asset', assetKey);
  for (const [k, v] of Object.entries(flat)) {
    if (DUTCH.test(v)) {
      console.log(k, '=>', v.slice(0, 90));
      n++;
    }
  }
  console.log('Dutch-like strings:', n);
})();
