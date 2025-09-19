const {
  fetchTranslatableResource,
  registerTranslationsReliable,
  getMainTheme,
} = require('./shopify.service');
const { logger } = require('../utils/logger');

/** Curated fixes (QA report v2) — bypass bad DeepL homonyms. */
const JT_TRUST_BY_LOCALE = {
  de: 'Vertraut von Tunern in ganz Europa',
  fr: 'La confiance des tuners à travers l\'Europe',
  en: 'Trusted by tuners across Europe',
  it: 'Scelto dai tuner in tutta Europa',
  es: 'La confianza de los tuners en toda Europa',
  pl: 'Zaufali nam tunerzy w całej Europie',
};

/**
 * Register fixed jt.product.trust_tuners per locale (IT/ES sintonizzatori fix).
 * @param {string} [themeGid]
 */
async function publishJtTrustTunersFix(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const nlRow = (tr.translatableContent || []).find(
    (c) => c.key === 'jt.product.trust_tuners' && c.locale === 'nl'
  );
  if (!nlRow?.digest) {
    logger.warn('jt_trust_tuners_no_nl_digest');
    return { skipped: true };
  }

  const results = [];
  for (const [locale, value] of Object.entries(JT_TRUST_BY_LOCALE)) {
    const reg = await registerTranslationsReliable(
      theme.id,
      [
        {
          locale,
          key: 'jt.product.trust_tuners',
          value,
          translatableContentDigest: nlRow.digest,
        },
      ],
      { batchSize: 1 }
    );
    results.push({ locale, value, reg });
    logger.info('jt_trust_tuners_published', { locale, value });
  }
  return { themeGid: theme.id, results };
}

module.exports = { publishJtTrustTunersFix, JT_TRUST_BY_LOCALE };
