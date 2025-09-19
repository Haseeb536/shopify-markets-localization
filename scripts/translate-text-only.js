/**
 * Translate catalog TEXT only — no theme Liquid, no locale JSON files, no layout changes.
 *
 * Uses Shopify Translations API + DeepL for:
 *   - Product title, body_html, SEO fields, variant options
 *   - Optional: collections, pages, menus (--with-collections etc.)
 *
 * Does NOT touch:
 *   - Theme .liquid files, snippets/jt-locale-string.liquid, header/footer patches
 *   - locales/*.json theme assets
 *   - product.json template / section settings
 *
 * Usage:
 *   npm run translate:text-only -- --limit 20     # smoke test
 *   npm run translate:text-only -- --resume       # continue catalog
 *   npm run translate:text-only -- --concurrency 8  # parallel products (faster)
 *   npm run translate:text-only -- --with-theme-text  # also theme UI words (no Liquid)
 *
 * After run: npm run fix:terminology  (also text-only safe)
 */
process.env.LOCALIZATION_TEXT_ONLY = '1';
process.env.LOCALIZATION_NO_REDIS = '1';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
const { syncStoreCatalogInline } = require('../src/services/storeComplete.service');
const { getShopPublishedLocaleCodes } = require('../src/services/shopify.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');
const { isTextOnlyMode } = require('../src/utils/textOnlyMode');

const PROGRESS_PATH = path.join(process.cwd(), 'data', 'store-text-only-progress.json');

const args = new Set(process.argv.slice(2));
const resume = args.has('--resume');
const fromStart = args.has('--from-start');
const withCollections = args.has('--with-collections');
const withPages = args.has('--with-pages');
const withMenus = args.has('--with-menus');
const skipTerminology = args.has('--skip-terminology');
const withThemeText = args.has('--with-theme-text');

function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    return { completedGids: [], errors: [] };
  }
}

function writeProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

function parseLimit() {
  const idx = process.argv.indexOf('--limit');
  if (idx === -1) return null;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseConcurrency() {
  const idx = process.argv.indexOf('--concurrency');
  if (idx === -1) return config.queue.productConcurrency;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : config.queue.productConcurrency;
}

(async () => {
  assertRequired();
  if (!isTextOnlyMode()) throw new Error('LOCALIZATION_TEXT_ONLY not set');

  clearGlossaryCaches();
  clearVariantOptionsCache();

  const published = await getShopPublishedLocaleCodes();
  console.log('=== TEXT-ONLY translation (no theme / design changes) ===\n');
  console.log('Source:', config.locales.source);
  console.log('Targets:', config.locales.targets.join(', '));
  console.log('Published:', published.join(', '));
  console.log('');
  console.log('SKIPPED: theme Liquid, header/footer/snippet patches');
  if (withThemeText) {
    console.log('INCLUDED: theme UI words via Translations API + locales/*.json (--with-theme-text)');
  }
  console.log('');

  if (!published.some((l) => config.locales.targets.includes(l.split('-')[0]))) {
    console.warn(
      'WARNING: No TARGET_LOCALES are published on this shop. Product translation will be skipped until you publish the language (e.g. Spanish in Settings → Languages).\n'
    );
  }

  const progress =
    resume && !fromStart
      ? readProgress()
      : { startedAt: new Date().toISOString(), completedGids: [], errors: [], mode: 'text-only' };
  if (!resume || fromStart) {
    progress.startedAt = new Date().toISOString();
    progress.completedGids = [];
    progress.errors = [];
    progress.mode = 'text-only';
  }
  const skipGids = new Set(progress.completedGids || []);
  if (resume && skipGids.size) {
    console.log(`Resuming — ${skipGids.size} products already done.\n`);
  }

  const limit = parseLimit();
  const productConcurrency = parseConcurrency();
  console.log(`Parallel workers: ${productConcurrency} products at a time\n`);
  console.log('Phase 1/2: Products + variant options (Translations API only)...');

  let progressWrites = 0;
  const catalog = await syncStoreCatalogInline({
    themeLocale: false,
    products: true,
    withOptions: true,
    withCollections,
    withPages,
    withMenus,
    skipGids,
    productLimit: limit,
    productConcurrency,
    onProductDone(gid, ok, err) {
      if (ok) {
        if (!skipGids.has(gid)) {
          progress.completedGids.push(gid);
          skipGids.add(gid);
        }
      } else if (err) {
        progress.errors.push({ gid, error: err, at: new Date().toISOString() });
      }
      progressWrites += 1;
      if (progressWrites % 10 === 0) {
        writeProgress(progress);
      }
    },
  });

  writeProgress(progress);

  /** @type {Record<string, unknown>} */
  const result = { catalog, progressFile: PROGRESS_PATH, mode: 'text-only' };

  if (withThemeText) {
    console.log('\nPhase 1b: Theme UI text (Translations API — no Liquid)…');
    const { syncThemeTextWithoutLiquid } = require('../src/services/themeTextOnly.service');
    result.themeText = await syncThemeTextWithoutLiquid({ menus: true });
  }

  if (!skipTerminology) {
    console.log('\nPhase 2/2: Glossary / terminology (titles, bodies, options — no theme)...');
    const { listAllProductGids } = require('../src/services/shopify.service');
    const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
    const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
    const { translateProductOptionsForProduct } = require('../src/services/translateProductOptions.service');

    const gids = await listAllProductGids();
    const scopeGids = limit ? gids.slice(0, limit) : gids;

    result.terminology = {
      titles: await fixAllProductTitlesWithGlossary(scopeGids),
      bodies: await repairPublishedProductBodies(scopeGids),
    };

    let optionsOk = 0;
    for (const gid of scopeGids) {
      try {
        await translateProductOptionsForProduct(gid);
        optionsOk += 1;
      } catch (e) {
        console.warn('options', gid.split('/').pop(), e.message);
      }
    }
    result.terminology.variantOptions = { products: optionsOk };
  }

  result.completedProducts = progress.completedGids.length;
  result.errorCount = progress.errors.length;

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nProgress: ${PROGRESS_PATH}`);
  console.log('Theme was NOT modified. Re-run with --resume if interrupted.');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
