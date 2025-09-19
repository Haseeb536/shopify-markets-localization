/**
 * Full store localization without Redis — theme, locale files, entire catalog + variant options.
 *
 * Usage:
 *   npm run translate:store:full
 *   npm run translate:store:full -- --resume
 *   npm run translate:store:full -- --text-only   # products only — NO theme/design changes
 *   npm run translate:store:full -- --products-only   # same as --text-only
 *   npm run translate:store:full -- --limit 50      # test run
 *
 * Progress: data/store-translate-progress.json (resume with --resume)
 */
process.env.LOCALIZATION_NO_REDIS = '1';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
const {
  syncThemeStorefrontAllLocales,
  syncStoreCatalogInline,
} = require('../src/services/storeComplete.service');
const { getMainTheme, getShopPublishedLocaleCodes } = require('../src/services/shopify.service');
const { deployJtLocaleFallback } = require('../src/services/jtLocaleFallback.service');
const { translateProductPageSchemaKeys, applyEnglishLocaleCopyFixes } = require('../src/services/themeLocaleSchema.service');
const { publishJtTrustTunersFix } = require('../src/services/themeStringOverrides.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');

const PROGRESS_PATH = path.join(process.cwd(), 'data', 'store-translate-progress.json');

const args = new Set(process.argv.slice(2));
const resume = args.has('--resume');
const textOnly = args.has('--text-only') || args.has('--products-only');
let productsOnly = textOnly;
const withCollections = args.has('--with-collections');
const withPages = args.has('--with-pages');
const withMenus = args.has('--with-menus');

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

(async () => {
  assertRequired();
  if (textOnly) {
    process.env.LOCALIZATION_TEXT_ONLY = '1';
  }
  clearGlossaryCaches();
  clearVariantOptionsCache();

  const published = await getShopPublishedLocaleCodes();
  console.log('=== JT full store translate (no Redis) ===\n');
  if (textOnly) {
    console.log('MODE: text-only — theme Liquid and locale JSON will NOT be modified.\n');
  }
  console.log('Source:', config.locales.source);
  console.log('Targets:', config.locales.targets.join(', '));
  console.log('Published:', published.join(', '));
  console.log('');

  const progress = resume ? readProgress() : { startedAt: new Date().toISOString(), completedGids: [], errors: [] };
  if (!resume) {
    progress.startedAt = new Date().toISOString();
    progress.completedGids = [];
    progress.errors = [];
  }
  const skipGids = new Set(progress.completedGids || []);
  if (resume && skipGids.size && !args.has('--from-start')) {
    productsOnly = true;
    console.log(`Resuming — ${skipGids.size} products already done (skipping theme phase).\n`);
  } else if (resume && skipGids.size) {
    console.log(`Resuming — ${skipGids.size} products already done.\n`);
  }

  /** @type {Record<string, unknown>} */
  const result = {};

  if (!productsOnly) {
    console.log('Phase 1/4: Theme UI (snippets, dates, jt keys, product template strings)...');
    try {
      result.sync = await syncThemeStorefrontAllLocales();
    } catch (e) {
      const msg = e.response?.data || e.message;
      console.warn('Phase 1 partial failure (continuing to catalog):', msg);
      result.syncError = msg;
    }
    const theme = await getMainTheme();
    try {
      result.jtFallback = await deployJtLocaleFallback(theme.id);
    } catch (e) {
      console.warn('JT locale fallback skipped:', e.message);
      result.jtFallbackError = e.message;
    }
    try {
      result.schemaKeys = await translateProductPageSchemaKeys(theme.id);
      result.enCopyFixes = await applyEnglishLocaleCopyFixes(theme.id);
    } catch (e) {
      console.warn('Theme schema keys skipped:', e.message);
      result.schemaKeysError = e.message;
    }
    console.log('Phase 1 done.\n');
  }

  console.log('Phase 2/4: Catalog (theme locale JSON + all products + variant options)...');
  const limit = parseLimit();

  /** @type {Record<string, unknown>} */
  const catalog = {};

  if (!productsOnly) {
    try {
      catalog.themeLocale = await syncStoreCatalogInline({
        themeLocale: true,
        products: false,
      });
    } catch (e) {
      console.warn('Theme locale JSON partial failure (continuing):', e.message);
      catalog.themeLocaleError = e.message;
    }
  }

  catalog.products = (
    await syncStoreCatalogInline({
      themeLocale: false,
      products: true,
      withOptions: true,
      withCollections,
      withPages,
      withMenus,
      skipGids,
      productLimit: limit,
      onProductDone(gid, ok, err) {
      if (ok) {
        if (!skipGids.has(gid)) {
          progress.completedGids.push(gid);
          skipGids.add(gid);
        }
      } else if (err) {
        progress.errors.push({ gid, error: err, at: new Date().toISOString() });
      }
      if (progress.completedGids.length % 10 === 0) {
        writeProgress(progress);
      }
    },
    })
  ).products;
  result.catalog = catalog;
  writeProgress(progress);

  if (!productsOnly) {
    console.log('\nPhase 3/4: Lock trust badge strings (tuner homonym fix)...');
    const theme = await getMainTheme();
    result.trustTuners = await publishJtTrustTunersFix(theme.id);
  }

  if (!args.has('--skip-structural')) {
    console.log('\nPhase 4/4: Structural fixes (nav, dates, titles, variant options)...');
    const { runCatalogStructuralFix } = require('../src/services/catalogStructuralFix.service');
    result.structural = await runCatalogStructuralFix({
      bodies: args.has('--with-body'),
      repairBodies: true,
      related: args.has('--with-related'),
      theme: !textOnly,
      titles: true,
      titleRetranslate: false,
      options: true,
    });
  }

  result.progressFile = PROGRESS_PATH;
  result.completedProducts = progress.completedGids.length;
  result.errorCount = progress.errors.length;

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nProgress saved: ${PROGRESS_PATH}`);
  console.log('Hard-refresh storefronts. Re-run with --resume if interrupted.');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
