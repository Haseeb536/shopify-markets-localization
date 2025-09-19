/**
 * QA report fixes (P1 + P2):
 * - FAQ rebuild EN/IT/DE/FR
 * - Variant color values + NL Red→Rood
 * - Glossary / FR cleanup
 * - header.general.shop_name locale keys
 * - Set-contents install line IT/ES
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { fixNlColorOptionValues } = require('../src/services/fixNlColorOptionValues.service');
const { runCatalogStructuralFix } = require('../src/services/catalogStructuralFix.service');

(async () => {
  assertRequired();
  clearGlossaryCaches();

  const colors = await fixNlColorOptionValues();
  // eslint-disable-next-line no-console
  console.log('NL color values:', colors);

  const report = await runCatalogStructuralFix({
    titles: true,
    options: true,
    theme: true,
    repairBodies: true,
    related: true,
    bodies: false,
    titleRetranslate: false,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.message);
  process.exit(1);
});
