/**
 * Re-publish variant option names/values (glossary + DeepL) for all or listed products.
 * Use after fixing DEEPL_API_BASE or when product_option_value_translate_failed appeared in logs.
 *
 *   npm run fix:product-options
 *   npm run fix:product-options -- 10335150047579 10335150342491
 */
process.env.LOCALIZATION_NO_REDIS = '1';

require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { listAllProductGids, Gid } = require('../src/services/shopify.service');
const { translateProductOptionsForProduct } = require('../src/services/translateProductOptions.service');
const { getDeepLGlossaryStatus } = require('../src/services/deepl.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

const argv = process.argv.slice(2);
const ids = argv.filter((a) => !a.startsWith('--'));
function parseFromIndex() {
  const i = argv.indexOf('--from');
  if (i === -1) return 0;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 1 ? n - 1 : 0;
}
const fromIndex = parseFromIndex();

(async () => {
  assertRequired();
  clearGlossaryCaches();
  clearVariantOptionsCache();

  console.log('DeepL API base:', config.deepl.apiBase);
  console.log('Glossary:', getDeepLGlossaryStatus());
  console.log('');

  console.log('Loading product list from Shopify...');
  const gids = ids.length
    ? ids.map((id) => Gid.product(id.replace(/\D/g, '')))
    : await listAllProductGids();
  const slice = fromIndex > 0 ? gids.slice(fromIndex) : gids;
  if (fromIndex > 0) {
    console.log(`Resuming from product #${fromIndex + 1} (${slice.length} remaining)...\n`);
  } else {
    console.log(`Processing ${gids.length} products (glossary colors + DeepL)...\n`);
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < slice.length; i++) {
    const gid = slice[i];
    const absoluteIndex = fromIndex + i;
    const numeric = gid.split('/').pop();
    try {
      const r = await translateProductOptionsForProduct(gid);
      ok += 1;
      console.log(
        `[${absoluteIndex + 1}/${gids.length}] ${numeric} — glossary rows: ${r.glossaryPublished}, translated: ${r.translated}`
      );
    } catch (e) {
      fail += 1;
      console.error(`[${absoluteIndex + 1}/${gids.length}] ${numeric} — ${e.message}`);
    }
  }

  console.log(`\nDone. OK: ${ok}, failed: ${fail}`);
  if (fail) process.exit(1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
