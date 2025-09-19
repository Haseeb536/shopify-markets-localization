/**
 * Translate remaining product-page Dutch strings (accordions, delivery label)
 * via Shopify Translations API + patch missed Liquid paths.
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  getMainTheme,
  fetchTranslatableResource,
  registerTranslations,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');
const { translateContentItems, toDeepLTarget } = require('../src/services/deepl.service');
const { loadGlossary, applyGlossaryPost } = require('../src/utils/glossary');
const { patchThemeSnippetStrings } = require('../src/services/themeSnippetStrings.service');

const KEY_PREFIXES = [
  'section.product.json.main.content_VdNWWq',
  'section.product.json.main.content_NXhqmi',
  'jt.product.expected_delivery',
];

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

function matchesKey(key) {
  return KEY_PREFIXES.some((p) => key === p || key.startsWith(p));
}

async function patchRemainingVerwachte() {
  const axios = require('axios');
  const theme = await getMainTheme();
  const id = theme.id.split('/').pop();
  const base = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const key = 'snippets/dynamic-shipping-calculator.liquid';
  const res = await axios.get(base, { headers, params: { 'asset[key]': key } });
  let content = res.data.asset.value;
  const before = (content.match(/Verwachte levering/g) || []).length;
  if (!before) return { patched: false, remaining: 0 };

  content = content.replace(/Verwachte levering:/g, "{{ 'jt.product.expected_delivery' | t }}:");
  await axios.put(
    base,
    { asset: { key, value: content } },
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
  const after = (content.match(/Verwachte levering/g) || []).length;
  return { patched: true, before, after };
}

async function translateStorefrontKeys() {
  const glossaryMap = loadGlossary(config.paths.glossary);
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const src = normalizeLocale(config.locales.source);
  const items = (tr.translatableContent || []).filter(
    (c) => matchesKey(c.key) && normalizeLocale(c.locale) === src && c.value?.trim()
  );

  if (!items.length) {
    // eslint-disable-next-line no-console
    console.log('No matching source keys; run patch:theme-snippets first');
    return;
  }

  const published = new Set((await getShopPublishedLocaleCodes()).map(normalizeLocale));
  const targets = config.locales.targets.map(normalizeLocale).filter((l) => published.has(l) && l !== src);

  for (const targetLocale of targets) {
    const translated = await translateContentItems(
      items.map((c) => ({ key: c.key, text: c.value })),
      targetLocale,
      src
    );
    const deeplTarget = toDeepLTarget(targetLocale);
    const batch = items.map((c, i) => ({
      locale: targetLocale,
      key: c.key,
      value: applyGlossaryPost(translated[i] ?? c.value, deeplTarget, glossaryMap),
      translatableContentDigest: c.digest,
    }));
    const reg = await registerTranslations(theme.id, batch);
  }

  // eslint-disable-next-line no-console
  console.log('Registered', items.length, 'keys for', targets.join(', '));
  for (const c of items) {
    // eslint-disable-next-line no-console
    console.log(' ', c.key, '=>', c.value.slice(0, 60));
  }
}

(async () => {
  assertRequired();
  const liquid = await patchRemainingVerwachte();
  // eslint-disable-next-line no-console
  console.log('Liquid patch:', liquid);
  await patchThemeSnippetStrings();
  await translateStorefrontKeys();

  const theme = await getMainTheme();
  const check = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "en") { key value }
      }
    }`,
    { id: theme.id }
  );
  const en = (check.translatableResource.translations || []).filter((t) => matchesKey(t.key));
  // eslint-disable-next-line no-console
  console.log('\nEN after fix:');
  for (const t of en) console.log(' ', t.key, '=>', t.value?.slice(0, 80));
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.response?.data || e.message);
  process.exit(1);
});
