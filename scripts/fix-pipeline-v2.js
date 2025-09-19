/**
 * QA Report v2 — fix trust badges, re-translate product page, related Forge SKUs.
 * Usage: node scripts/fix-pipeline-v2.js [productId]
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { Gid } = require('../src/services/shopify.service');
const { publishJtTrustTunersFix } = require('../src/services/themeStringOverrides.service');
const { translateProductComplete } = require('../src/services/translateProductComplete.service');
const { translateRelatedProductsForPage } = require('../src/services/translateRelatedProducts.service');
const { getDeepLGlossaryStatus } = require('../src/services/deepl.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

const productId = process.argv[2] || '10360905269595';

(async () => {
  assertRequired();
  clearGlossaryCaches();
  clearVariantOptionsCache();

  console.log('DeepL glossary status:', getDeepLGlossaryStatus());
  console.log('(Set DEEPL_GLOSSARY_ID_NL_IT etc. in .env when DeepL glossaries are created)\n');

  console.log('1) Full product page translate (FMINDK43)...');
  const gid = Gid.product(productId);
  const page = await translateProductComplete(gid, { withRelated: false });
  console.log('   product locales:', page.product?.results?.map((r) => r.locale).join(', '));

  console.log('\n2) Lock jt.product.trust_tuners (after translate — IT/ES/FR tuner homonym)...');
  const trust = await publishJtTrustTunersFix(page.themeGid);
  console.log('   done', trust.themeGid);

  console.log('\n3) Translate related Forge products (titles + bodies)...');
  const related = await translateRelatedProductsForPage(gid, 'Forge');
  console.log('   translated', related.count, 'products');

  console.log('\n4) Apply QA post-edits all locales...');
  const { execSync } = require('child_process');
  execSync(`node scripts/apply-product-locale-qa.js ${productId} all`, {
    stdio: 'inherit',
    cwd: require('path').join(__dirname, '..'),
  });

  console.log('\n5) Diagnose...');
  execSync(`node scripts/diagnose-storefront-v2.js ${productId}`, {
    stdio: 'inherit',
    cwd: require('path').join(__dirname, '..'),
  });

  console.log('\nDone. Hard-refresh storefronts. Enable PL in Shopify for /pl/.');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
