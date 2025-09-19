const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { isTextOnlyMode, skipIfTextOnly } = require('../utils/textOnlyMode');
const { getMainTheme, putThemeLocaleAsset } = require('./themeLocale.service');

const limiter = new RateLimiter(config.queue.shopifyRps);

/** Dutch storefront copy hardcoded in Liquid → theme locale keys. */
const SNIPPET_STRINGS = {
  'jt.product.trust_tuners': 'Vertrouwd door tuners in heel Europa',
  'jt.product.free_shipping_nl_be_de': 'Gratis verzending vanaf €350 in NL, BE, DE',
  'jt.product.returns_14_days': '14 dagen retour zonder gedoe',
  'jt.product.satisfied_customers': '10.000+ tevreden klanten',
  'jt.product.expected_delivery': 'Verwachte levering',
  'jt.product.delivery_icon_alt': 'Bezorgicoon',
};

const LIQUID_REPLACEMENTS = [
  {
    assetKey: 'snippets/product-price.liquid',
    replacements: [
      ['<span>Vertrouwd door tuners in heel Europa</span>', "<span>{{ 'jt.product.trust_tuners' | t }}</span>"],
      [
        '<span>Gratis verzending vanaf €350 in NL, BE, DE</span>',
        "<span>{{ 'jt.product.free_shipping_nl_be_de' | t }}</span>",
      ],
      ['<span>14 dagen retour zonder gedoe</span>', "<span>{{ 'jt.product.returns_14_days' | t }}</span>"],
    ],
  },
  {
    assetKey: 'snippets/product-meta.liquid',
    replacements: [
      [
        '<span class="trustpilot-text">10.000+ tevreden klanten</span>',
        "<span class=\"trustpilot-text\">{{ 'jt.product.satisfied_customers' | t }}</span>",
      ],
    ],
  },
  {
    assetKey: 'snippets/dynamic-shipping-calculator.liquid',
    replacements: [
      ['Verwachte levering:', "{{ 'jt.product.expected_delivery' | t }}:"],
      [
        'alt="{{ \'jt.product.delivery_icon_alt\' | t }}"',
        'alt="{% render \'jt-locale-string\', key: \'product.delivery_icon_alt\' %}"',
      ],
      ['alt="Bezorgicoon"', 'alt="{% render \'jt-locale-string\', key: \'product.delivery_icon_alt\' %}"'],
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
  const value = res.data?.asset?.value;
  if (value == null) throw new Error(`Missing theme asset ${assetKey}`);
  return value;
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
 * Replace hardcoded Dutch spans in product snippets with | t filters and seed nl.json keys.
 * @param {string} [themeGid]
 */
async function patchThemeSnippetStrings(themeGid) {
  const blocked = skipIfTextOnly('patchThemeSnippetStrings');
  if (blocked) return { ...blocked, patched: [] };

  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  if (!theme?.id) throw new Error('No theme');

  const sourceAsset = process.env.THEME_SOURCE_ASSET || 'locales/nl.json';
  const patched = [];

  for (const { assetKey, replacements } of LIQUID_REPLACEMENTS) {
    let content = await fetchThemeAsset(theme.id, assetKey);
    let changed = false;
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      await putThemeAsset(theme.id, assetKey, content);
      patched.push(assetKey);
    }
  }

  await putThemeLocaleAsset(theme.id, sourceAsset, SNIPPET_STRINGS);

  return {
    themeGid: theme.id,
    patched,
    localeKeys: Object.keys(SNIPPET_STRINGS),
  };
}

module.exports = { patchThemeSnippetStrings, SNIPPET_STRINGS };
