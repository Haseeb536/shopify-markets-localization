/**
 * Shopify Markets language matrix (single source of truth).
 *
 * Base: Dutch (NL) → targets via DeepL + Shopify Translations API.
 * Shopify locale codes are lowercase ISO-style (nl, de, fr, en, it, es, pl).
 */

const SOURCE_LOCALE = 'nl';

/** Target locale codes — order preserved for bulk jobs and logging */
const DEFAULT_TARGET_LOCALES = ['de', 'fr', 'en', 'it', 'es', 'pl'];

const LOCALE_LABELS = {
  nl: 'Dutch (NL)',
  de: 'German (DE)',
  fr: 'French (FR)',
  en: 'English (EN)',
  it: 'Italian (IT)',
  es: 'Spanish (ES)',
  pl: 'Polish (PL)',
};

/** Comma-separated default for .env.example and docs */
const TARGET_LOCALES_ENV = DEFAULT_TARGET_LOCALES.join(',');

/**
 * @param {string[]} targets
 * @param {string} source
 */
function filterTargetsExcludingSource(targets, source) {
  const src = String(source).toLowerCase().split('-')[0];
  return targets.filter((t) => String(t).toLowerCase().split('-')[0] !== src);
}

module.exports = {
  SOURCE_LOCALE,
  DEFAULT_TARGET_LOCALES,
  TARGET_LOCALES_ENV,
  LOCALE_LABELS,
  filterTargetsExcludingSource,
};
