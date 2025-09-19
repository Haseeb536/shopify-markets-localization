/**
 * Post-translation grammar fixes (gender, articles) per locale.
 * Runs after glossary + locale-qa replacements.
 */

/** @type {Record<string, Array<{ find: string|RegExp, replace: string }>>} */
const GRAMMAR_RULES = {
  it: [
    { find: /\buna tubo\b/gi, replace: 'un tubo' },
    { find: /\buna sistema\b/gi, replace: 'un sistema' },
    { find: /\buna kit\b/gi, replace: 'un kit' },
    { find: /\buna intercooler\b/gi, replace: 'un intercooler' },
    { find: /\buna downpipe\b/gi, replace: 'un downpipe' },
    { find: /\buna presa\b/gi, replace: 'una presa' },
    { find: /\buno tubo\b/gi, replace: 'un tubo' },
    { find: /\buno sistema\b/gi, replace: 'un sistema' },
  ],
  fr: [
    { find: /\s+\.\s+\./g, replace: '.' },
    { find: /\?\s*\./g, replace: '?' },
  ],
  es: [
    { find: /\s+\.\s+\./g, replace: '.' },
  ],
  de: [
    { find: /\s+\.\s+\./g, replace: '.' },
    { find: /\bWieviel\b/g, replace: 'Wie viel' },
    { find: /\bDer\s+<strong>Forge\b/g, replace: 'Das <strong>Forge' },
    { find: /\bKohlefaser-Carbon\b/gi, replace: 'Kohlefaser' },
  ],
  en: [
    { find: /\b(This|The|A|An)\s+Intake\b/g, replace: '$1 intake' },
    { find: /\b(\d+mm)\s+Intake\b/gi, replace: '$1 intake' },
    { find: /\bintake\s+tube\b/gi, replace: 'intake tube' },
    { find: /\bIntake\s+tube\b/g, replace: 'intake tube' },
    { find: /\bIntake\s+fits\b/g, replace: 'intake fits' },
    { find: /\bThis\s+Intake\b/g, replace: 'This intake' },
    { find: /\bthe\s+Intercooler\b/gi, replace: 'the intercooler' },
    { find: /\bThe\s+Intercooler\b/g, replace: 'The intercooler' },
    { find: /\ban\s+Intercooler\b/gi, replace: 'an intercooler' },
    { find: /\bAn\s+Intercooler\b/g, replace: 'An intercooler' },
    { find: /\bfor\s+the\s+Intercooler\b/gi, replace: 'for the intercooler' },
    { find: /\bwith\s+the\s+Intercooler\b/gi, replace: 'with the intercooler' },
    { find: /\bThis\s+Intercooler\b/g, replace: 'This intercooler' },
    { find: /\bthis\s+Intercooler\b/g, replace: 'this intercooler' },
  ],
};

/**
 * @param {string} text
 * @param {string} locale
 */
function applyGrammarQaPost(text, locale) {
  if (!text) return text;
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const rules = GRAMMAR_RULES[loc];
  if (!rules) return text;
  let out = text;
  for (const { find, replace } of rules) {
    out = out.replace(find, replace);
  }
  return out;
}

module.exports = { applyGrammarQaPost, GRAMMAR_RULES };
