const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { logger } = require('../utils/logger');
const { skipIfTextOnly } = require('../utils/textOnlyMode');
const { getMainTheme, putThemeLocaleAsset } = require('./themeLocale.service');
const { repairShippingCalculatorLiquid } = require('./repairShippingCalculator.service');

const limiter = new RateLimiter(config.queue.shopifyRps);

const LOCALE_STRINGS = {
  'header.general.shop_name': 'JT Products',
  'header.general.cart': 'Winkelwagen',
  'jt.contact.whatsapp_title': 'Whatsapp ons',
  'jt.contact.reply_one_day': 'Antwoord binnen 1 werkdag',
  'jt.contact.email_title': 'Mail ons',
  'jt.footer.rights_reserved': 'Alle rechten voorbehouden',
  'jt.footer.privacy': 'Privacyverklaring',
  'jt.footer.terms': 'Algemene voorwaarden',
};

const NEWSLETTER_LABEL_PATCHES = [
  [
    '<label for="newsletter-name-{{ section.id }}" class="tcc-label-top">Naam *</label>',
    '<label for="newsletter-name-{{ section.id }}" class="tcc-label-top">{{ \'contact.form.name\' | t }} *</label>',
  ],
  [
    '<label for="newsletter-email-{{ section.id }}" class="tcc-label-top">E-mailadres *</label>',
    '<label for="newsletter-email-{{ section.id }}" class="tcc-label-top">{{ \'contact.form.email\' | t }} *</label>',
  ],
];

const SHIPPING_JS_LOCALE_PATCHES = [
  ["toLocaleDateString('en-US'", "toLocaleDateString((request.locale.iso_code || 'en').replace('_','-')"],
  ['toLocaleDateString("en-US")', 'toLocaleDateString((request.locale.iso_code || "en").replace("_","-")'],
  ["toLocaleString('en-US'", "toLocaleString((request.locale.iso_code || 'en').replace('_','-')"],
];

/** When theme prints "8 jun - 11 jun", resolve month via month_map (not raw English). */
const SHIPPING_MONTH_OUTPUT_PATCHES = [
  [
    '{{ start_day }} {{ start_month }} - {{ end_day }} {{ end_month }}',
    "{% assign start_month_label = start_month %}{% assign end_month_label = end_month %}{% for pair in month_map %}{% assign parts = pair | split: ':' %}{% if parts[0] == start_month %}{% assign start_month_label = parts[1] %}{% endif %}{% if parts[0] == end_month %}{% assign end_month_label = parts[1] %}{% endif %}{% endfor %}{% if delivery_locale == 'de' %}{{ start_day }}. {{ start_month_label }} - {{ end_day }}. {{ end_month_label }}{% else %}{{ start_day }} {{ start_month_label }} - {{ end_day }} {{ end_month_label }}{% endif %}",
  ],
  [
    '{{ start_day }} {{ start_month }} - {{ end_day }} {{ end_month }}',
    "{% assign start_month_label = start_month %}{% assign end_month_label = end_month %}{% for pair in month_map %}{% assign parts = pair | split: ':' %}{% if parts[0] == start_month %}{% assign start_month_label = parts[1] %}{% endif %}{% if parts[0] == end_month %}{% assign end_month_label = parts[1] %}{% endif %}{% endfor %}{{ start_day }} {{ start_month_label }} - {{ end_day }} {{ end_month_label }}",
  ],
];

const ASSET_PATCHES = [
  {
    assetKey: 'sections/three-column-contact.liquid',
    replacements: [
      ['Whatsapp ons', "{{ 'jt.contact.whatsapp_title' | t }}"],
      ['Mail ons', "{{ 'jt.contact.email_title' | t }}"],
      ['Antwoord binnen 1 werkdag', "{{ 'jt.contact.reply_one_day' | t }}"],
      ...NEWSLETTER_LABEL_PATCHES,
    ],
  },
  {
    assetKey: 'sections/footer.liquid',
    replacements: [
      [
        'JT-Products - Alle rechten voorbehouden |',
        "JT-Products - {{ 'jt.footer.rights_reserved' | t }} |",
      ],
      [
        'rel="noopener">Privacyverklaring</a>',
        "rel=\"noopener\">{{ 'jt.footer.privacy' | t }}</a>",
      ],
      [
        'rel="noopener">Algemene voorwaarden</a>',
        "rel=\"noopener\">{{ 'jt.footer.terms' | t }}</a>",
      ],
    ],
  },
  {
    assetKey: 'snippets/dynamic-shipping-calculator.liquid',
    replacements: [
      [
        "{% assign month_map = 'jan:jan,feb:feb,mar:mrt,apr:apr,may:mei,jun:jun,jul:jul,aug:aug,sep:sep,oct:okt,nov:nov,dec:dec' | split: ',' %}",
        "{% assign delivery_locale = request.locale.iso_code | split: '-' | first %}{% case delivery_locale %}{% when 'de' %}{% assign month_map = 'jan:Jan.,feb:Feb.,mar:März,apr:Apr.,may:Mai,jun:Juni,jul:Juli,aug:Aug.,sep:Sep.,oct:Okt.,nov:Nov.,dec:Dez.' | split: ',' %}{% when 'fr' %}{% assign month_map = 'jan:janv.,feb:févr.,mar:mars,apr:avr.,may:mai,jun:juin,jul:juil.,aug:août,sep:sept.,oct:oct.,nov:nov.,dec:déc.' | split: ',' %}{% when 'it' %}{% assign month_map = 'jan:gen,feb:feb,mar:mar,apr:apr,may:mag,jun:giu,jul:lug,aug:ago,sep:set,oct:ott,nov:nov,dec:dic' | split: ',' %}{% when 'es' %}{% assign month_map = 'jan:ene,feb:feb,mar:mar,apr:abr,may:may,jun:jun,jul:jul,aug:ago,sep:sep,oct:oct,nov:nov,dec:dic' | split: ',' %}{% when 'pl' %}{% assign month_map = 'jan:sty,feb:lut,mar:mar,apr:kwi,may:maj,jun:cze,jul:lip,aug:sie,sep:wrz,oct:paź,nov:lis,dec:gru' | split: ',' %}{% when 'nl' %}{% assign month_map = 'jan:jan,feb:feb,mar:mrt,apr:apr,may:mei,jun:jun,jul:jul,aug:aug,sep:sep,oct:okt,nov:nov,dec:dec' | split: ',' %}{% else %}{% assign month_map = 'jan:Jan,feb:Feb,mar:Mar,apr:Apr,may:May,jun:Jun,jul:Jul,aug:Aug,sep:Sep,oct:Oct,nov:Nov,dec:Dec' | split: ',' %}{% endcase %}",
      ],
      [
        "{% if request.locale.iso_code == 'nl' %}{% assign month_map = 'jan:jan,feb:feb,mar:mrt,apr:apr,may:mei,jun:jun,jul:jul,aug:aug,sep:sep,oct:okt,nov:nov,dec:dec' | split: ',' %}{% else %}{% assign month_map = 'jan:jan,feb:feb,mar:mar,apr:apr,may:may,jun:jun,jul:jul,aug:aug,sep:sep,oct:oct,nov:nov,dec:dec' | split: ',' %}{% endif %}",
        "{% assign delivery_locale = request.locale.iso_code | split: '-' | first %}{% case delivery_locale %}{% when 'de' %}{% assign month_map = 'jan:Jan.,feb:Feb.,mar:März,apr:Apr.,may:Mai,jun:Juni,jul:Juli,aug:Aug.,sep:Sep.,oct:Okt.,nov:Nov.,dec:Dez.' | split: ',' %}{% when 'fr' %}{% assign month_map = 'jan:janv.,feb:févr.,mar:mars,apr:avr.,may:mai,jun:juin,jul:juil.,aug:août,sep:sept.,oct:oct.,nov:nov.,dec:déc.' | split: ',' %}{% when 'it' %}{% assign month_map = 'jan:gen,feb:feb,mar:mar,apr:apr,may:mag,jun:giu,jul:lug,aug:ago,sep:set,oct:ott,nov:nov,dec:dic' | split: ',' %}{% when 'es' %}{% assign month_map = 'jan:ene,feb:feb,mar:mar,apr:abr,may:may,jun:jun,jul:jul,aug:ago,sep:sep,oct:oct,nov:nov,dec:dic' | split: ',' %}{% when 'pl' %}{% assign month_map = 'jan:sty,feb:lut,mar:mar,apr:kwi,may:maj,jun:cze,jul:lip,aug:sie,sep:wrz,oct:paź,nov:lis,dec:gru' | split: ',' %}{% when 'nl' %}{% assign month_map = 'jan:jan,feb:feb,mar:mrt,apr:apr,may:mei,jun:jun,jul:jul,aug:aug,sep:sep,oct:okt,nov:nov,dec:dec' | split: ',' %}{% else %}{% assign month_map = 'jan:Jan,feb:Feb,mar:Mar,apr:Apr,may:May,jun:Jun,jul:Jul,aug:Aug,sep:Sep,oct:Oct,nov:Nov,dec:Dec' | split: ',' %}{% endcase %}",
      ],
    ],
  },
];

async function fetchThemeAsset(themeGid, assetKey) {
  const id = themeGid.split('/').pop();
  const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  const res = await limiter.schedule(() =>
    axios.get(url, {
      params: { 'asset[key]': assetKey },
      headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
      timeout: 60000,
    })
  );
  return res.data?.asset?.value;
}

async function putThemeAsset(themeGid, assetKey, value) {
  const id = themeGid.split('/').pop();
  const url = `${config.shopify.adminBaseUrl}/themes/${id}/assets.json`;
  await limiter.schedule(() =>
    axios.put(
      url,
      { asset: { key: assetKey, value } },
      {
        headers: {
          'X-Shopify-Access-Token': config.shopify.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    )
  );
  logger.info('theme_asset_updated', { themeGid, assetKey });
}

/**
 * @param {string} [themeGid]
 */
async function patchThemeContactAndFooter(themeGid) {
  const blocked = skipIfTextOnly('patchThemeContactAndFooter');
  if (blocked) return { ...blocked, patched: [] };

  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  if (!theme?.id) throw new Error('No theme');

  const sourceAsset = process.env.THEME_SOURCE_ASSET || 'locales/nl.json';
  const patched = [];

  try {
    const shippingRepair = await repairShippingCalculatorLiquid(theme.id);
    if (shippingRepair.repaired) patched.push('snippets/dynamic-shipping-calculator.liquid (rebuilt)');
  } catch (e) {
    logger.warn('shipping_calculator_repair_failed', { error: e.message });
  }

  for (const { assetKey, replacements } of ASSET_PATCHES) {
    if (assetKey === 'snippets/dynamic-shipping-calculator.liquid') continue;
    let content = await fetchThemeAsset(theme.id, assetKey);
    let changed = false;
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }
    if (assetKey === 'snippets/dynamic-shipping-calculator.liquid') {
      for (const [from, to] of SHIPPING_JS_LOCALE_PATCHES) {
        if (content.includes(from)) {
          content = content.split(from).join(to);
          changed = true;
        }
      }
      for (const [from, to] of SHIPPING_MONTH_OUTPUT_PATCHES) {
        if (content.includes(from) && !content.includes('start_month_label')) {
          content = content.split(from).join(to);
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      await putThemeAsset(theme.id, assetKey, content);
      patched.push(assetKey);
    }
  }

  const localePut = await putThemeLocaleAsset(theme.id, sourceAsset, LOCALE_STRINGS);

  return {
    themeGid: theme.id,
    patched,
    localeKeys: Object.keys(LOCALE_STRINGS),
    localePut,
  };
}

module.exports = { patchThemeContactAndFooter, LOCALE_STRINGS };
