const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'config', 'month-labels.json');

/** @returns {{ numeric: Record<string, string[]>, abbr: Record<string, Record<string, string>> }} */
function loadMonthLabels() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Liquid month_map string for numeric month keys (01-12).
 * @param {string} locale
 */
function buildNumericMonthMapString(locale) {
  const { numeric } = loadMonthLabels();
  const months = numeric[locale] || numeric.en;
  return months
    .map((label, i) => `${String(i + 1).padStart(2, '0')}:${label}`)
    .join(',');
}

/** @returns {Record<string, Record<string, string>>} */
function getAbbrMonthMaps() {
  return loadMonthLabels().abbr;
}

module.exports = {
  loadMonthLabels,
  buildNumericMonthMapString,
  getAbbrMonthMaps,
};
