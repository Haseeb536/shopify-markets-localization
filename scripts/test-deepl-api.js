require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config, assertRequired } = require('../src/config');

const PRO = 'https://api.deepl.com';
const FREE = 'https://api-free.deepl.com';
const DETECTED_PATH = path.join(process.cwd(), 'data', 'deepl-api-base.json');

async function tryBase(apiBase) {
  const body = new URLSearchParams();
  body.append('text', 'Hallo wereld');
  body.append('source_lang', 'NL');
  body.append('target_lang', 'EN-GB');
  const url = `${apiBase}/v2/translate`;
  const res = await axios.post(url, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `DeepL-Auth-Key ${config.deepl.apiKey}`,
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}

(async () => {
  assertRequired();

  const results = [];
  for (const base of [PRO, FREE]) {
    const r = await tryBase(base);
    const ok = r.status === 200;
    results.push({ base, ok, status: r.status, data: r.data });
  }

  const working = results.filter((r) => r.ok).map((r) => r.base);
  if (!working.length) {
    console.error('DeepL: no working endpoint. Check DEEPL_API_KEY.');
    process.exit(1);
  }

  const detected = working[0];
  fs.mkdirSync(path.dirname(DETECTED_PATH), { recursive: true });
  fs.writeFileSync(
    DETECTED_PATH,
    `${JSON.stringify({ apiBase: detected, working, detectedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );

  console.log('DeepL endpoint check\n');
  for (const r of results) {
    const sample = r.ok ? r.data?.translations?.[0]?.text : r.data?.message || r.status;
    console.log(`  ${r.base}  ${r.ok ? 'OK' : 'FAIL'}  ${r.ok ? `→ "${sample}"` : sample}`);
  }

  console.log(`\nDetected API: ${detected}`);
  console.log(`Saved: ${DETECTED_PATH}`);

  const configured = config.deepl.apiBase;
  if (working.includes(configured)) {
    console.log(`\n.env DEEPL_API_BASE is correct (${configured}).`);
    process.exit(0);
  }

  console.error(`\n.env mismatch: DEEPL_API_BASE=${configured}`);
  console.error(`Set:  DEEPL_API_BASE=${detected}`);
  process.exit(1);
})().catch((e) => {
  console.error('DeepL test failed:', e.response?.data || e.message);
  process.exit(1);
});
