/**
 * Human-readable summary: product + jt keys per locale.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  Gid,
  getMainTheme,
  getShopPublishedLocaleCodes,
  fetchTranslationsMap,
} = require('../src/services/shopify.service');
const { fetchThemeLocaleAsset, flattenStringLeaves } = require('../src/services/themeLocale.service');
const { buildThemeLocaleAssetMap } = require('../src/services/themeLocale.service');

const productId = process.argv[2] || '10360905269595';
const JT_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/jt-locale-overrides.json'), 'utf8')
);

const JT_KEYS = [
  'jt.product.trust_tuners',
  'jt.product.free_shipping_nl_be_de',
  'jt.product.returns_14_days',
  'jt.product.satisfied_customers',
  'jt.product.expected_delivery',
  'jt.product.delivery_icon_alt',
  'jt.contact.whatsapp_title',
  'jt.contact.reply_one_day',
  'jt.contact.email_title',
  'jt.footer.rights_reserved',
  'jt.footer.privacy',
  'jt.footer.terms',
];

const SCHEMA_KEYS = ['contact.form.name', 'contact.form.email', 'home_page.newsletter.input'];

(async () => {
  assertRequired();
  const productGid = Gid.product(productId);
  const themeGid = (await getMainTheme()).id;
  const published = (await getShopPublishedLocaleCodes())
    .map((l) => l.toLowerCase().split('-')[0])
    .filter((l) => l !== 'nl');
  const configured = config.locales.targets.map((l) => l.toLowerCase().split('-')[0]);
  const assetMap = await buildThemeLocaleAssetMap(themeGid, published);

  console.log('Forge intake product page — translation summary\n');

  for (const locale of [...new Set([...configured, ...published])].sort()) {
    if (locale === 'nl') continue;
    console.log(`## ${locale.toUpperCase()}`);
    if (!published.includes(locale)) {
      console.log('  Status: NOT PUBLISHED in Shopify (add in Settings → Languages)\n');
      continue;
    }

    const pdata = await graphql(
      `query($id: ID!, $loc: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $loc) { key value }
        }
      }`,
      { id: productGid, loc: locale }
    );
    const rows = pdata.translatableResource?.translations || [];
    const title = rows.find((t) => t.key === 'title')?.value || '(missing)';
    const body = rows.find((t) => t.key === 'body_html')?.value || '';
    const bodyOk = body.length > 500 && !/\b(vermogenstoename|inlaatbocht|eenvoudig retourneren)\b/i.test(body);
    console.log(`  Product title: ${title.slice(0, 70)}${title.length > 70 ? '…' : ''}`);
    console.log(`  Product body: ${body.length} chars — ${bodyOk ? 'translated' : 'CHECK (short or Dutch leak)'}`);

    const themeTr = await fetchTranslationsMap(themeGid, locale);
    const jtMissing = [];
    const jtSameNl = [];
    for (const k of JT_KEYS) {
      const short = k.slice(3);
      if (JT_OVERRIDES[locale]?.[short]) continue;
      const nlVal = (await fetchTranslationsMap(themeGid, 'nl')).get(k);
      const tr = themeTr.get(k);
      if (!tr) jtMissing.push(k);
      else if (tr === nlVal) jtSameNl.push(k);
    }
    if (jtMissing.length) console.log(`  jt.* API missing: ${jtMissing.join(', ')}`);
    else console.log('  jt.* API: all present (or IT liquid fallback)');
    if (jtSameNl.length) console.log(`  jt.* still NL text: ${jtSameNl.join(', ')}`);

    try {
      const assetKey = assetMap[locale];
      if (assetKey) {
        const json = await fetchThemeLocaleAsset(themeGid, assetKey);
        const flat = flattenStringLeaves(json);
        const schema = SCHEMA_KEYS.map((k) => `${k}=${flat[k] || '(missing)'}`).join('; ');
        console.log(`  Locale file (${assetKey}): ${schema}`);
      }
    } catch {
      console.log('  Locale file: (not found)');
    }
    console.log('');
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
