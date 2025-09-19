const { config } = require('../config');
const {
  getMainTheme,
  fetchTranslatableResource,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('./shopify.service');
const { logger } = require('../utils/logger');

const THEME_STRING_FIXES = {
  'section.product.json.text_with_icons_FUUP7z.item_eVdMiY.content:38v1m0lopuvjo': {
    es: '<p><strong>Asesoramiento de tuning</strong> por expertos</p>',
    it: '<p><strong>Consulenza tuning</strong> da esperti</p>',
    de: '<p><strong>Tuning-Beratung</strong> von Experten</p>',
    fr: '<p><strong>Conseils tuning</strong> par des experts</p>',
    en: '<p><strong>Tuning advice</strong> by experts</p>',
  },
  'section.product.json.text_with_icons_FUUP7z.item_yD4bQd.content:1fnz6ftog083k': {
    fr: '<p><strong>Les frais de port sont gratuits </strong>à partir de 350 €*</p>',
    en: '<p><strong>Free </strong>shipping from €350*</p>',
    de: '<p><strong>Kostenloser </strong>Versand ab €350*</p>',
    it: '<p><strong>Spedizione gratuita </strong>a partire da €350*</p>',
    es: '<p><strong>Envío gratuito </strong>a partir de 350 €*</p>',
  },
  'section.product.json.text_with_icons_FUUP7z.item_7WgVRU.content:s5ja4oqgo348': {
    fr: '<p><strong>Payer</strong> maintenant ou plus tard <strong>en 3 parties</strong></p>',
    en: '<p><strong>Pay</strong> now or later <strong>in 3 instalments</strong></p>',
    de: '<p><strong>Jetzt</strong> oder später <strong>in 3 Raten</strong> bezahlen</p>',
    it: '<p><strong>Paga</strong> ora o dopo <strong>in 3 rate</strong></p>',
    es: '<p><strong>Paga</strong> ahora o después <strong>en 3 plazos</strong></p>',
  },
  'section.product.json.text_with_icons_FUUP7z.item_arhYTb.content:hrh1ku505i5m': {
    fr: '<p>10 000+ <strong>clients satisfaits</strong></p>',
    en: '<p>10,000+ <strong>satisfied</strong> customers</p>',
    de: '<p>10.000+ <strong>zufriedene</strong> Kunden</p>',
    it: '<p>10.000+ <strong>clienti soddisfatti</strong></p>',
    es: '<p>10.000+ <strong>clientes satisfechos</strong></p>',
  },
  'section.index.json.text_with_icons_9qww49.item_kxkEnn.content:2ev729a6x76i0': {
    fr: '<p><strong>Les frais de port sont gratuits </strong>à partir de 350 €*</p>',
  },
  'section.index.json.text_with_icons_9qww49.item_49NMb6.content:unigsmnix08f': {
    fr: '<p><strong>Payer</strong> maintenant ou plus tard <strong>en 3 parties</strong></p>',
  },
};

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * Register curated fixes for theme product-page strings (tuning advice, etc.).
 */
async function fixThemeProductStrings() {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l));
  let registered = 0;

  for (const [key, perLocale] of Object.entries(THEME_STRING_FIXES)) {
    const row = (tr.translatableContent || []).find((c) => c.key === key && c.digest);
    if (!row) continue;
    const batch = [];
    for (const locale of targets) {
      const value = perLocale[locale];
      if (!value) continue;
      batch.push({
        locale,
        key,
        value,
        translatableContentDigest: row.digest,
      });
    }
    if (batch.length) {
      await registerTranslationsReliable(theme.id, batch, { batchSize: 10 });
      registered += batch.length;
      logger.info('theme_product_string_fixed', { key, locales: batch.length });
    }
  }
  return { themeGid: theme.id, registered };
}

module.exports = { fixThemeProductStrings, THEME_STRING_FIXES };
