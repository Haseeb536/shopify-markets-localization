/**
 * Glossary + terminology cleanup pass (no DeepL).
 * Fixes: Forge brand lock, BOV/Intercooler terms, --> artifact, wastegate option label.
 *
 * Usage: node scripts/fix-terminology-cleanup.js
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { translateProductOptionsForProduct } = require('../src/services/translateProductOptions.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

assertRequired();
clearGlossaryCaches();
clearVariantOptionsCache();

function stripDescriptionArtifact(html) {
  let out = String(html || '');
  const before = out;
  out = applyProductBodyStructuralRepair(out, 'nl');
  return out === before ? null : out;
}

(async () => {
  const gids = await listAllProductGids();
  console.log(`=== Terminology cleanup (${gids.length} products) ===\n`);

  let nlFixed = 0;
  for (const gid of gids) {
    const data = await graphql(
      `query($id: ID!) {
        product(id: $id) { id descriptionHtml }
      }`,
      { id: gid }
    );
    const desc = data.product?.descriptionHtml || '';
    const cleaned = stripDescriptionArtifact(desc);
    if (cleaned) {
      const res = await graphql(
        `mutation($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }`,
        { input: { id: gid, descriptionHtml: cleaned } }
      );
      const errs = res.productUpdate?.userErrors || [];
      if (!errs.length) {
        nlFixed += 1;
        console.log('NL source fixed:', gid.split('/').pop());
      }
    }
  }

  console.log(`\nNL descriptions cleaned: ${nlFixed}`);

  const bodies = await repairPublishedProductBodies(gids);
  console.log('Bodies:', bodies);

  const titles = await fixAllProductTitlesWithGlossary(gids);
  console.log('Titles:', titles);

  let optionsOk = 0;
  let optionsPublished = 0;
  for (const gid of gids) {
    try {
      const r = await translateProductOptionsForProduct(gid);
      optionsOk += 1;
      optionsPublished += r.glossaryPublished || 0;
    } catch (e) {
      console.warn('options failed', gid.split('/').pop(), e.message);
    }
  }
  console.log('Variant options:', { products: optionsOk, glossaryPublished: optionsPublished });
  console.log('\nDone. Hard-refresh storefront pages.');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
