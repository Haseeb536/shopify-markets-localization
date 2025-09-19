/**
 * One command: full product page in every TARGET_LOCALE.
 * - Product title + body_html (Translations API)
 * - Product template theme (accordions, returns, icons, contact, recommendations)
 * - jt.product.* / jt.contact.* in locales/it.json, en.default.json, etc.
 *
 * Usage: npm run translate:product:full -- 10360905269595
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const { Gid } = require('../src/services/shopify.service');
const { translateProductComplete } = require('../src/services/translateProductComplete.service');
const { applyGlossaryPost, loadGlossary } = require('../src/utils/glossary');
const {
  extractJsonLdFromHtml,
  finalizeProductBodyHtml,
  isProductBodyKey,
} = require('../src/utils/productHtml');
const { toDeepLTarget } = require('../src/services/deepl.service');
const {
  fetchTranslatableResource,
  registerTranslations,
} = require('../src/services/shopify.service');

const args = new Set(process.argv.slice(2));
const productId = process.argv.find((a) => /^\d+$/.test(a));
if (!productId) {
  console.error('Usage: npm run translate:product:full -- <productId>');
  process.exit(1);
}

(async () => {
  assertRequired();
  const gid = Gid.product(productId);
  console.log('Full translate:', gid);
  console.log('Locales:', config.locales.targets.join(', '));
  console.log('');

  const withRelated = !args.has('--no-related');
  const result = await translateProductComplete(gid, {
    withRelated,
    relatedQuery: process.env.RELATED_PRODUCTS_QUERY || 'Yaris GR',
  });
  console.log('Theme template keys:', result.productTemplateTheme.keys);
  console.log('Product locales:', result.product?.results?.map((r) => r.locale).join(', '));

  // Extra QA pass on product body per locale
  const glossaryMap = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(gid);
  const srcRows = (tr.translatableContent || []).filter(
    (c) =>
      String(c.locale).toLowerCase().startsWith(config.locales.source) && c.value?.trim()
  );
  const digestByKey = new Map(srcRows.map((c) => [c.key, c.digest]));

  for (const loc of config.locales.targets) {
    const data = await require('../src/services/shopify.service').graphql(
      `query($id: ID!, $locale: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $locale) { key value }
        }
      }`,
      { id: gid, locale: loc }
    );
    const rows = data.translatableResource?.translations || [];
    const batch = [];
    for (const row of rows) {
      if (!row.value) continue;
      const digest = digestByKey.get(row.key);
      if (!digest) continue;
      let fixed = applyGlossaryPost(row.value, toDeepLTarget(loc), glossaryMap);
      if (isProductBodyKey(row.key)) {
        const split = extractJsonLdFromHtml(fixed);
        fixed = await finalizeProductBodyHtml(split.html, loc, {
          jsonLdBlocks: split.jsonLdBlocks,
        });
      }
      if (fixed !== row.value) {
        batch.push({
          locale: loc,
          key: row.key,
          value: fixed,
          translatableContentDigest: digest,
        });
      }
    }
    if (batch.length) {
      for (let i = 0; i < batch.length; i += 20) {
        await registerTranslations(gid, batch.slice(i, i + 20));
      }
      console.log('QA patched', batch.length, 'product fields for', loc);
    }
  }

  console.log('\nDone. Hard-refresh the product page per language (/en/, /it/, /de/).');
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
