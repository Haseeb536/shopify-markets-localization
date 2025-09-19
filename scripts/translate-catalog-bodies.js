/**
 * DeepL translate product body_html for the full catalog (descriptions, features, specs, FAQ).
 *
 * Usage:
 *   node scripts/translate-catalog-bodies.js
 *   node scripts/translate-catalog-bodies.js --resume
 *   node scripts/translate-catalog-bodies.js --limit 5
 *   node scripts/translate-catalog-bodies.js --product-id 10360900256091
 *
 * Progress: data/catalog-body-translate-progress.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired } = require('../src/config');
const { listAllProductGids } = require('../src/services/shopify.service');
const { translateResource } = require('../src/services/translation.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { clearGlossaryCaches } = require('../src/utils/glossary');

assertRequired();
clearGlossaryCaches();

const PROGRESS_PATH = path.join(process.cwd(), 'data', 'catalog-body-translate-progress.json');

function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    return { completedGids: [], errors: [], startedAt: null };
  }
}

function writeProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const idIdx = args.indexOf('--product-id');
  let productGid;
  if (idIdx >= 0 && args[idIdx + 1]) {
    const id = String(args[idIdx + 1]).replace(/\D/g, '');
    productGid = `gid://shopify/Product/${id}`;
  }
  const limitIdx = args.indexOf('--limit');
  let limit = null;
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    const n = Number(args[limitIdx + 1]);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
  return { resume, productGid, limit };
}

(async () => {
  const { resume, productGid, limit } = parseArgs();
  const progress = resume ? readProgress() : { startedAt: new Date().toISOString(), completedGids: [], errors: [] };
  if (!resume) {
    progress.startedAt = new Date().toISOString();
    progress.completedGids = [];
    progress.errors = [];
  }
  const done = new Set(progress.completedGids || []);

  let gids = productGid ? [productGid] : await listAllProductGids();
  gids = gids.filter((g) => !done.has(g));
  if (limit) gids = gids.slice(0, limit);

  console.log('=== Catalog body translation (body_html only) ===\n');
  console.log(`Products to process: ${gids.length} (${done.size} already done)`);
  if (!gids.length) {
    console.log('Nothing to do.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < gids.length; i++) {
    const gid = gids[i];
    const numeric = gid.split('/').pop();
    process.stdout.write(`[${i + 1}/${gids.length}] ${numeric} … `);
    try {
      const result = await translateResource(
        gid,
        { topic: 'catalog-body-translate' },
        (key) => String(key).toLowerCase() === 'body_html'
      );
      if (result.skipped) {
        console.log('skipped', result.reason || '');
        progress.errors.push({ gid, error: result.reason || 'skipped' });
        failed += 1;
      } else {
        await repairPublishedProductBodies([gid]);
        progress.completedGids.push(gid);
        done.add(gid);
        writeProgress(progress);
        ok += 1;
        const locales = (result.results || []).map((r) => r.locale).join(',');
        console.log('ok', `(${locales || 'registered'})`);
      }
    } catch (e) {
      const msg = e.response?.data?.errors?.[0]?.message || e.message;
      console.log('FAIL', msg);
      progress.errors.push({ gid, error: msg });
      failed += 1;
      writeProgress(progress);
    }
  }

  if (!productGid && !limit) {
    console.log('\nRunning title glossary pass…');
    const titles = await fixAllProductTitlesWithGlossary();
    console.log('Titles:', titles);
  }

  progress.finishedAt = new Date().toISOString();
  writeProgress(progress);

  console.log('\n=== Done ===');
  console.log(JSON.stringify({ ok, failed, totalDone: progress.completedGids.length }, null, 2));
  console.log(`Progress file: ${PROGRESS_PATH}`);
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
