/**
 * Production blockers: shipping calculator rebuild, shop name, variants, bodies, theme.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { runCatalogStructuralFix } = require('../src/services/catalogStructuralFix.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

(async () => {
  assertRequired();
  clearGlossaryCaches();
  clearVariantOptionsCache();
  const report = await runCatalogStructuralFix({
    theme: true,
    titles: true,
    options: true,
    repairBodies: true,
    related: true,
    bodies: false,
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.response?.data || e.message);
  process.exit(1);
});
