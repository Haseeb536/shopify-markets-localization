const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { applyGrammarQaPost } = require('./grammarQa');

const MOTORSPORT_PATH = path.join(process.cwd(), 'config', 'motorsport-terminology.json');
const CANONICAL_TERMS_PATH = path.join(process.cwd(), 'config', 'canonical-product-terms.json');

let cached = {
  map: /** @type {Record<string, Record<string, string>>} */ ({}),
  mtime: 0,
  motorsportMtime: 0,
  canonicalMtime: 0,
};

/**
 * @param {string} filePath
 * @returns {Record<string, unknown>}
 */
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * @param {Record<string, unknown>} data
 * @returns {Record<string, Record<string, string>>}
 */
function parseGlossarySection(data) {
  /** @type {Record<string, Record<string, string>>} */
  const map = {};
  const section = data.glossary || data;
  for (const [source, targets] of Object.entries(section)) {
    if (source.startsWith('_')) continue;
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) continue;
    const key = source.trim();
    map[key] = {};
    for (const [loc, phrase] of Object.entries(targets)) {
      if (String(loc).startsWith('_')) continue;
      map[key][String(loc).toUpperCase()] = String(phrase);
    }
  }
  return map;
}

/**
 * Merge motorsport + optional custom glossary (custom wins on duplicate keys).
 * @param {string} glossaryPath
 */
function loadGlossary(glossaryPath) {
  const resolved = path.isAbsolute(glossaryPath)
    ? glossaryPath
    : path.join(process.cwd(), glossaryPath);

  let motorsportMtime = 0;
  let motorsportMap = {};
  try {
    const msStat = fs.statSync(MOTORSPORT_PATH);
    motorsportMtime = msStat.mtimeMs;
    motorsportMap = parseGlossarySection(readJsonFile(MOTORSPORT_PATH));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.warn('motorsport_terminology_load_error', { error: e.message });
    }
  }

  let customMap = {};
  let customMtime = 0;
  try {
    const stat = fs.statSync(resolved);
    customMtime = stat.mtimeMs;
    customMap = parseGlossarySection(readJsonFile(resolved));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.error('glossary_load_error', { path: resolved, error: e.message });
    }
  }

  let canonicalMap = {};
  let canonicalMtime = 0;
  try {
    const cStat = fs.statSync(CANONICAL_TERMS_PATH);
    canonicalMtime = cStat.mtimeMs;
    canonicalMap = parseGlossarySection(readJsonFile(CANONICAL_TERMS_PATH));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.warn('canonical_terms_load_error', { error: e.message });
    }
  }

  if (
    cached.mtime === customMtime &&
    cached.motorsportMtime === motorsportMtime &&
    cached.canonicalMtime === canonicalMtime &&
    Object.keys(cached.map).length
  ) {
    return cached.map;
  }

  const map = { ...motorsportMap, ...customMap, ...canonicalMap };
  cached = { map, mtime: customMtime, motorsportMtime, canonicalMtime };
  logger.debug('glossary_loaded', {
    motorsportTerms: Object.keys(motorsportMap).length,
    customTerms: Object.keys(customMap).length,
    canonicalTerms: Object.keys(canonicalMap).length,
    total: Object.keys(map).length,
  });
  return map;
}

/**
 * @param {string} locale
 * @returns {Array<{ find: string, replace: string }>}
 */
function loadLocaleQaReplacements(locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  /** @type {Array<{ find: string, replace: string }>} */
  const replacements = [];

  try {
    const motorsport = readJsonFile(MOTORSPORT_PATH);
    const fromMotorsport = motorsport.qa?.[loc];
    if (Array.isArray(fromMotorsport)) {
      replacements.push(...fromMotorsport);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.warn('motorsport_qa_load_error', { loc, error: e.message });
    }
  }

  const localePath = path.join(process.cwd(), 'config', 'locale-qa', `${loc}.json`);
  try {
    const raw = readJsonFile(localePath);
    if (Array.isArray(raw.replacements)) {
      replacements.push(...raw.replacements);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.warn('locale_qa_load_error', { loc, error: e.message });
    }
  }

  // Longest match first so specific phrases win over short substrings
  return replacements
    .filter((r) => r.find && r.replace != null)
    .sort((a, b) => b.find.length - a.find.length);
}

/**
 * Apply motorsport terminology + custom glossary to translated string.
 * @param {string} text
 * @param {string} deeplTargetLang e.g. DE, FR, EN-GB
 * @param {Record<string, Record<string, string>>} glossaryMap
 */
function applyGlossaryPost(text, deeplTargetLang, glossaryMap) {
  if (!text || !glossaryMap) return text;
  const langKey = deeplTargetLang.split('-')[0].toUpperCase();
  let out = text;
  out = out.replace(/\bForja\b/gi, 'Forge');
  out = out.replace(/\bSchmiede\b/gi, 'Forge');
  out = out.replace(/\bschmieden\b/gi, 'Forge');
  out = out.replace(/\bforgia\b/gi, 'Forge');
  out = out.replace(/\bdella\s+forgia\b/gi, 'Forge');
  out = out.replace(/\bde\s+la\s+forja\b/gi, 'Forge');
  out = out.replace(/\bAusblasventil\b/gi, 'Blow-Off-Ventil');
  out = out.replace(/\bForge(?=[A-Za-zÀ-ÿÄÖÜäöü])/g, 'Forge ');
  out = out.replace(/Forge\s+sport\s+automobile/gi, 'Forge Motorsport');
  out = out.replace(/Forge\s+automovilismo/gi, 'Forge Motorsport');
  const entries = Object.entries(glossaryMap).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [source, perLocale] of entries) {
    const replacement = perLocale[langKey] || perLocale[deeplTargetLang.toUpperCase()];
    if (!replacement) continue;
    const re = new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi');
    out = out.replace(re, replacement);
  }
  out = out.replace(/\bTurbo\s+Einlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\bTurbo-Einlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\bRecirculation\s+Valve\s+Kit\b/gi, '__RECIRC_KIT__');
  out = out.replace(/\bRecirculation\s+Valve\b/gi, '__RECIRC_VALVE__');
  out = out.replace(/\bUmgehungsventil\b/gi, 'Recirculation Valve');
  out = out.replace(/__RECIRC_VALVE__/g, 'Recirculation Valve');
  out = out.replace(/__RECIRC_KIT__/g, 'Recirculation Valve Kit');
  out = out.replace(/Radiateur d'huile(?:\s+d'huile)+/gi, "Radiateur d'huile");
  out = out.replace(/refroidisseur d'huile(?:\s+d'huile)+/gi, "refroidisseur d'huile");
  out = out.replace(/Ölkühler(?:\s+Ölkühler)+/gi, 'Ölkühler');
  out = out.replace(/Radiatore olio(?:\s+olio)+/gi, 'Radiatore olio');
  out = out.replace(/Radiador de aceite(?:\s+de aceite)+/gi, 'Radiador de aceite');
  out = out.replace(/\bkit de levier de vitesses court\b/gi, 'Short Shift Kit');
  out = out.replace(/\bkit de levier de vitesse court\b/gi, 'Short Shift Kit');
  out = out.replace(/\blevier de vitesses court\b/gi, 'Short Shift');
  out = out.replace(/\blevier de vitesse court\b/gi, 'Short Shift');
  out = out.replace(/\bkit cambio corto\b/gi, 'Short Shift Kit');
  out = out.replace(/\bkit de cambio corto\b/gi, 'Short Shift Kit');
  out = out.replace(/\bcambio corto\b/gi, 'Short Shift');
  out = out.replace(/\bkurzschalthebel\b/gi, 'Short Shift');
  out = out.replace(/\bleva corta\b/gi, 'Short Shift');
  out = out.replace(/\bpalanca corta\b/gi, 'Short Shift');
  out = out.replace(/\bshort-shift\b/gi, 'Short Shift');
  out = applyLocaleQaPost(out, langKey);
  return applyGrammarQaPost(out, String(langKey).toLowerCase().split('-')[0]);
}

/** @type {Map<string, Array<{ find: string, replace: string }>>} */
const qaCache = new Map();

/**
 * Locale QA: motorsport mistranslation fixes + config/locale-qa/{locale}.json
 * @param {string} text
 * @param {string} langKey uppercased locale, e.g. IT
 */
function applyLocaleQaPost(text, langKey) {
  if (!text) return text;
  const loc = String(langKey || '').toLowerCase().split('-')[0];
  if (!loc) return text;

  let replacements = qaCache.get(loc);
  if (!replacements) {
    replacements = loadLocaleQaReplacements(loc);
    qaCache.set(loc, replacements);
  }

  let out = text;
  for (const { find, replace } of replacements) {
    out = out.split(find).join(replace);
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Clear caches after editing terminology files (tests / hot reload). */
function clearGlossaryCaches() {
  cached = { map: {}, mtime: 0, motorsportMtime: 0, canonicalMtime: 0 };
  qaCache.clear();
}

module.exports = {
  loadGlossary,
  applyGlossaryPost,
  applyLocaleQaPost,
  loadLocaleQaReplacements,
  clearGlossaryCaches,
  MOTORSPORT_PATH,
};
