require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');

const Q = `query($id: ID!, $loc: String!) {
  product(id: $id) { title handle }
  tr: translatableResource(resourceId: $id) {
    translatableContent { key locale value }
    translations(locale: $loc) { key value }
  }
}`;

async function check(gid, label) {
  if (!gid) return;
  const d = await graphql(Q, { id: gid, loc: 'es' });
  const esTitle = d.tr?.translations?.find((t) => t.key === 'title')?.value;
  const esBody = d.tr?.translations?.find((t) => t.key === 'body_html')?.value;
  const nlTitle = d.tr?.translatableContent?.find((t) => t.key === 'title' && t.locale === 'nl')?.value;
  console.log(`\n${label} ${gid.split('/').pop()}`);
  console.log('  NL source title:', (nlTitle || d.product?.title || '').slice(0, 70));
  console.log('  ES title:', esTitle ? esTitle.slice(0, 70) : '(MISSING)');
  console.log('  ES body:', esBody ? `${esBody.length} chars` : '(MISSING)');
}

(async () => {
  assertRequired();
  const p = require('../data/store-text-only-progress.json');
  const completed = new Set(p.completedGids || []);
  const errGids = new Set((p.errors || []).map((e) => e.gid));
  let missingEs = 0;
  let hasEs = 0;
  const sample = p.completedGids.slice(0, 5);
  for (const gid of sample) {
    const d = await graphql(Q, { id: gid, loc: 'es' });
    const esTitle = d.tr?.translations?.find((t) => t.key === 'title')?.value;
    if (esTitle?.trim()) hasEs += 1;
    else missingEs += 1;
    await check(gid, 'COMPLETED');
  }
  const quotaErr = (p.errors || []).find((e) => /quota/i.test(e.error));
  await check(quotaErr?.gid, 'QUOTA_FAIL');
  const notDone = (await require('../src/services/shopify.service').listAllProductGids())
    .filter((g) => !completed.has(g) && !errGids.has(g))
    .slice(0, 1)[0];
  await check(notDone, 'NOT_STARTED');

  console.log(`\nProgress: ${completed.size} completed, ${errGids.size} errors, ~${6339 - completed.size} remaining`);
  console.log(`Sample completed with ES title: ${hasEs}/${sample.length}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
