/**
 * Complete store localization: every published market gets full Italian/German/etc.
 *
 * Phase 1 (sync, needs DeepL): theme Liquid → |t keys, jt.* strings in all locale JSON files,
 *   product-page theme strings via Translations API for ALL targets.
 * Phase 2 (queue): theme locales/nl.json → de/fr/en/it/es/pl.json, all products.
 *
 * Usage:
 *   npm run translate:store              # sync + enqueue (needs Redis + worker)
 *   npm run translate:store:no-redis     # theme sync only, no Redis
 *   npm run translate:store -- --no-redis --with-products   # theme + all products inline (slow)
 *   npm run translate:store -- --sync-only
 *   npm run translate:store -- --enqueue-only
 *   npm run translate:store -- --with-theme-api   # also queue ~4600 theme API keys (slow)
 *
 * Redis/worker only when enqueueing. Product page: npm run fix:pipeline-v2 -- <productId>
 */
const argv = process.argv.slice(2);
const noRedisArgv =
  argv.includes('--no-redis') || argv.includes('--sync-only') || process.env.npm_lifecycle_event === 'translate:store:no-redis';
if (noRedisArgv) {
  process.env.LOCALIZATION_NO_REDIS = '1';
}

require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { runStoreCompleteTranslation } = require('../src/services/storeComplete.service');
const { getShopPublishedLocaleCodes } = require('../src/services/shopify.service');
const { requireRedis } = require('../src/utils/redisConnection');

const args = new Set(argv);
const noRedis = noRedisArgv;
const syncOnly = noRedis && !args.has('--with-products');
const syncInline = noRedis && (args.has('--with-products') || args.has('--full'));
const withOptions = args.has('--with-options') || args.has('--full');
const enqueueOnly = args.has('--enqueue-only');
const withThemeApi = args.has('--with-theme-api');

(async () => {
  assertRequired();
  if (!noRedis && !enqueueOnly) {
    await requireRedis();
  }
  const published = await getShopPublishedLocaleCodes();
  console.log('Source locale:', config.locales.source);
  console.log('Target locales (.env):', config.locales.targets.join(', '));
  console.log('Published on shop:', published.join(', '));
  console.log('');

  let skipGids;
  let onProductDone;
  if (syncInline && args.has('--resume')) {
    const fs = require('fs');
    const p = require('path').join(process.cwd(), 'data', 'store-translate-progress.json');
    try {
      const prog = JSON.parse(fs.readFileSync(p, 'utf8'));
      skipGids = new Set(prog.completedGids || []);
      console.log(`Resume: skipping ${skipGids.size} completed products\n`);
    } catch {
      skipGids = new Set();
    }
    onProductDone = (gid, ok, err) => {
      const fs = require('fs');
      const path = require('path');
      const progressPath = path.join(process.cwd(), 'data', 'store-translate-progress.json');
      let prog;
      try {
        prog = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      } catch {
        prog = { completedGids: [], errors: [] };
      }
      if (ok) {
        if (!prog.completedGids.includes(gid)) prog.completedGids.push(gid);
      } else {
        prog.errors = prog.errors || [];
        prog.errors.push({ gid, error: err, at: new Date().toISOString() });
      }
      fs.mkdirSync(path.dirname(progressPath), { recursive: true });
      fs.writeFileSync(progressPath, `${JSON.stringify(prog, null, 2)}\n`);
    };
  }

  const result = await runStoreCompleteTranslation({
    sync: !enqueueOnly,
    enqueue: !noRedis,
    syncInline,
    withOptions,
    skipGids,
    onProductDone,
    themeTranslationsApi: withThemeApi,
    collections: args.has('--with-collections'),
    pages: args.has('--with-pages'),
    menus: args.has('--with-menus'),
  });

  console.log(JSON.stringify(result, null, 2));
  console.log('');
  if (!noRedis) {
    console.log('Queued jobs — keep `npm run worker` running until the queue is empty.');
    console.log('Then hard-refresh /it/ and /de/ product pages.');
    const { getTranslationQueue } = require('../src/queues/translation.queue');
    await getTranslationQueue().close();
  } else if (syncInline) {
    console.log('Inline catalog sync finished (no Redis). Hard-refresh storefront locales.');
  } else if (!enqueueOnly) {
    console.log('Theme sync done (no Redis). For one product: npm run fix:pipeline-v2 -- <productId>');
  }
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
