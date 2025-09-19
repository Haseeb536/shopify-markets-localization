const { config } = require('../config');
const {
  fetchTranslatableResource,
  registerTranslations,
  getMainTheme,
} = require('./shopify.service');
const { putThemeLocaleAsset, buildThemeLocaleAssetMap } = require('./themeLocale.service');
const { LOCALE_STRINGS } = require('./themeContactPatch.service');

/** English copy for theme section keys (no DeepL). */
const EN_BY_DUTCH_SNIPPET = [
  ['Gratis </strong>verzending vanaf €350*', 'Free </strong>shipping from €350*'],
  ['<strong>Betaal</strong> nu of later <strong>in 3 delen</strong>', '<strong>Pay</strong> now or later <strong>in 3 installments</strong>'],
  ['<strong>Tuning advies</strong> door experts', '<strong>Tuning advice</strong> from experts'],
  ['Aanbevolen voor jou...', 'Recommended for you...'],
  ['Hulp nodig?', 'Need help?'],
  ['Contact opnemen', 'Contact us'],
  ['Alle producten bekijken', 'View all products'],
  ['Meld je aan voor de nieuwsbrief', 'Sign up for our newsletter'],
  ['Betaal nu of later in 3 delen', 'Pay now or later in 3 installments'],
  ['Tuning advies door experts', 'Expert tuning advice'],
  ['10.000+ tevreden klanten', '10,000+ satisfied customers'],
  ['Klantenservice', 'Customer service'],
  ['<strong>tevreden</strong>', '<strong>satisfied</strong>'],
  ['Start Whatsapp Chat', 'Start WhatsApp chat'],
];

const EN_JT_LOCALE = {
  'jt.contact.whatsapp_title': 'WhatsApp us',
  'jt.contact.reply_one_day': 'Reply within 1 business day',
  'jt.contact.email_title': 'Email us',
  'jt.footer.rights_reserved': 'All rights reserved',
  'jt.footer.privacy': 'Privacy policy',
  'jt.footer.terms': 'Terms and conditions',
};

function toEnglish(value) {
  let out = String(value);
  for (const [from, to] of EN_BY_DUTCH_SNIPPET) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function normalizeLocale(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

/**
 * @param {string} themeGid
 * @param {(key: string) => boolean} keyFilter
 * @param {string[]} locales e.g. ['en']
 */
async function registerManualThemeTranslations(themeGid, keyFilter, locales = ['en']) {
  const tr = await fetchTranslatableResource(themeGid);
  const src = normalizeLocale(config.locales.source);
  const items = (tr.translatableContent || []).filter(
    (c) => keyFilter(c.key) && normalizeLocale(c.locale) === src && c.value?.trim()
  );

  const results = [];
  for (const locale of locales.map(normalizeLocale)) {
    const batch = items.map((c) => {
      let value = EN_JT_LOCALE[c.key] || toEnglish(c.value);
      if (c.key.startsWith('jt.')) {
        value = EN_JT_LOCALE[c.key] || value;
      }
      return {
        locale,
        key: c.key,
        value,
        translatableContentDigest: c.digest,
      };
    });
    for (let i = 0; i < batch.length; i += 20) {
      const reg = await registerTranslations(themeGid, batch.slice(i, i + 20));
      results.push({ locale, register: reg });
    }
  }

  const assetMap = await buildThemeLocaleAssetMap(themeGid, locales);
  for (const locale of locales) {
    const loc = normalizeLocale(locale);
    const assetKey = assetMap[loc];
    if (!assetKey) continue;
    const flat = {};
    for (const [k, v] of Object.entries({ ...LOCALE_STRINGS, ...EN_JT_LOCALE })) {
      flat[k] = EN_JT_LOCALE[k] || v;
    }
    await putThemeLocaleAsset(themeGid, assetKey, flat);
  }

  return { keys: items.length, locales, results };
}

async function registerProductPageEnglish(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  const prefixes = [
    'section.product.json.',
    'section.sections/footer-group.json.',
    'jt.contact.',
    'jt.footer.',
  ];
  const filter = (key) => prefixes.some((p) => key.startsWith(p));
  return registerManualThemeTranslations(theme.id, filter, ['en']);
}

module.exports = {
  registerManualThemeTranslations,
  registerProductPageEnglish,
  toEnglish,
};
