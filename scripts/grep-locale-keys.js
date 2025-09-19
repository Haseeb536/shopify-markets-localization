require('dotenv').config();
const { assertRequired } = require('../src/config');
const {
  getMainTheme,
  fetchThemeLocaleAsset,
  resolveThemeLocaleAssetKey,
  listThemeLocaleAssetKeys,
  flattenStringLeaves,
} = require('../src/services/themeLocale.service');

const needle = process.argv[2] || 'naam';

(async () => {
  assertRequired();
  const theme = await getMainTheme();
  const keys = await listThemeLocaleAssetKeys(theme.id);
  for (const loc of ['nl', 'en']) {
    const assetKey = resolveThemeLocaleAssetKey(loc, keys);
    const json = await fetchThemeLocaleAsset(theme.id, assetKey);
    const flat = flattenStringLeaves(json);
    console.log('\n==', loc, assetKey, '==');
    for (const [k, v] of Object.entries(flat)) {
      if (k.toLowerCase().includes(needle) || v.toLowerCase().includes(needle)) {
        console.log(k, '=>', v);
      }
    }
  }
})();
