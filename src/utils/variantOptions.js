const fs = require('fs');
const path = require('path');

const VARIANT_PATH = path.join(process.cwd(), 'config', 'variant-options.json');

/** @type {{ optionNames: Record<string, Record<string, string>>, values: Record<string, Record<string, string>> } | null} */
let cached = null;
let mtime = 0;

function loadVariantOptions() {
  try {
    const stat = fs.statSync(VARIANT_PATH);
    if (cached && stat.mtimeMs === mtime) return cached;
    const raw = JSON.parse(fs.readFileSync(VARIANT_PATH, 'utf8'));
    cached = {
      optionNames: raw.optionNames || {},
      values: raw.values || {},
    };
    mtime = stat.mtimeMs;
    return cached;
  } catch {
    return { optionNames: {}, values: {} };
  }
}

/**
 * @param {string} sourceText option name or value from NL catalog
 * @param {string} targetLocale e.g. de, en
 * @param {'name' | 'value'} kind
 */
function lookupVariantOptionTranslation(sourceText, targetLocale, kind = 'value') {
  const map = loadVariantOptions();
  const loc = String(targetLocale || '').toUpperCase().split('-')[0];
  const table = kind === 'name' ? map.optionNames : map.values;
  const key = String(sourceText || '').trim();
  if (!key) return null;
  const row = table[key];
  if (!row) return null;
  return row[loc] || null;
}

function clearVariantOptionsCache() {
  cached = null;
  mtime = 0;
}

module.exports = {
  loadVariantOptions,
  lookupVariantOptionTranslation,
  clearVariantOptionsCache,
  VARIANT_PATH,
};
