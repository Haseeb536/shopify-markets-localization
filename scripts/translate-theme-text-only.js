/**
 * Translate theme UI words only — NO .liquid file edits (safe for layout).
 *
 * Translates via Shopify Translations API + locales/*.json:
 *   - Product page icons (free shipping, returns, trust lines when theme uses | t)
 *   - Footer, contact, header labels in locale files
 *   - Product template section strings
 *   - Store menus (optional)
 *
 * Does NOT modify snippets/sections/*.liquid (no layout risk).
 *
 * Usage:
 *   npm run translate:theme-text-only
 *   npm run translate:theme-text-only -- --no-menus
 *
 * Run once per target locale (set TARGET_LOCALES=es in .env).
 */
process.env.LOCALIZATION_TEXT_ONLY = '1';

require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { syncThemeTextWithoutLiquid } = require('../src/services/themeTextOnly.service');
const { getShopPublishedLocaleCodes } = require('../src/services/shopify.service');

const args = new Set(process.argv.slice(2));

(async () => {
  assertRequired();

  const published = await getShopPublishedLocaleCodes();
  console.log('=== Theme TEXT only (no Liquid / layout changes) ===\n');
  console.log('Targets:', config.locales.targets.join(', '));
  console.log('Published:', published.join(', '));
  console.log('');
  console.log('SAFE: Translations API + locales/*.json');
  console.log('SKIPPED: .liquid patches, jt-locale-string.liquid, header rewrites\n');

  const result = await syncThemeTextWithoutLiquid({
    menus: !args.has('--no-menus'),
  });

  console.log('\n=== Done ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(
    '\nNote: If trust badges still show Dutch, the theme may have hardcoded text in Liquid ' +
      '(not | t filters). That needs a one-time minimal wiring pass — ask before running full theme sync.'
  );
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
