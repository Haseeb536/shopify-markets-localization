const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config } = require('../config');
const { getMainTheme } = require('./shopify.service');
const { logger } = require('../utils/logger');
const { buildNumericMonthMapString, loadMonthLabels } = require('../utils/monthLabels');

const CANONICAL_PATH = path.join(
  process.cwd(),
  'config',
  'theme-assets',
  'dynamic-shipping-calculator.liquid'
);
const ASSET_KEY = 'snippets/dynamic-shipping-calculator.liquid';

function buildMonthMapCaseBlock() {
  const { numeric } = loadMonthLabels();
  const locales = ['de', 'fr', 'it', 'es', 'pl', 'nl'];
  const lines = [];
  for (const loc of locales) {
    const map = (numeric[loc] || [])
      .map((label, i) => `${String(i + 1).padStart(2, '0')}:${label}`)
      .join(',');
    lines.push(`    {% when '${loc}' %}`);
    lines.push(`      {% assign month_map = '${map}' | split: ',' %}`);
  }
  const enMap = (numeric.en || [])
    .map((label, i) => `${String(i + 1).padStart(2, '0')}:${label}`)
    .join(',');
  lines.push('    {% else %}');
  lines.push(`      {% assign month_map = '${enMap}' | split: ',' %}`);
  return lines.join('\n');
}

function buildCanonicalLiquid() {
  let template = fs.readFileSync(CANONICAL_PATH, 'utf8');
  const caseBlock = buildMonthMapCaseBlock();
  template = template.replace(
    /{% case delivery_locale %}[\s\S]*?{% endcase %}/,
    `{% case delivery_locale %}\n${caseBlock}\n  {% endcase %}`
  );
  return template;
}

function isCorrupted(content) {
  const s = String(content || '');
  return (
    (s.match(/\{% if request\.locale\.iso_code == 'nl' %\}/g) || []).length > 2 ||
    !s.includes('start_month_label') ||
    s.length > 12000
  );
}

async function putThemeAsset(themeGid, assetKey, value) {
  const id = themeGid.split('/').pop();
  const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  await axios.put(
    url,
    { asset: { key: assetKey, value } },
    {
      headers: {
        'X-Shopify-Access-Token': config.shopify.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );
}

/**
 * Replace corrupted shipping calculator Liquid with canonical locale-aware version.
 * @param {string} [themeGid]
 */
async function repairShippingCalculatorLiquid(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  if (!theme?.id) throw new Error('No theme');

  const id = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
    params: { 'asset[key]': ASSET_KEY },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
    timeout: 60000,
  });
  const current = res.data?.asset?.value || '';
  const canonical = buildCanonicalLiquid();
  const expectedEsJune = buildNumericMonthMapString('es').includes('06:junio');

  const usesNumericMonths = current.includes('start_month_num') && current.includes('localization.language.iso_code');
  const hasEsJune = current.includes('06:junio');
  if (
    !isCorrupted(current) &&
    usesNumericMonths &&
    hasEsJune &&
    expectedEsJune &&
    process.env.FORCE_SHIPPING_REBUILD !== '1'
  ) {
    return { themeGid: theme.id, repaired: false, reason: 'already_clean' };
  }

  await putThemeAsset(theme.id, ASSET_KEY, canonical);
  logger.info('shipping_calculator_repaired', { themeGid: theme.id, wasCorrupted: isCorrupted(current) });
  return { themeGid: theme.id, repaired: true, previousLength: current.length };
}

module.exports = {
  repairShippingCalculatorLiquid,
  isCorrupted,
  buildCanonicalLiquid,
  buildMonthMapCaseBlock,
};
