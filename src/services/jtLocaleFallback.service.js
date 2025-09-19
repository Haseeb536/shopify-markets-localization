const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { logger } = require('../utils/logger');
const { getMainTheme } = require('./shopify.service');

const limiter = new RateLimiter(config.queue.shopifyRps);
const OVERRIDES_PATH = path.join(__dirname, '../../config/jt-locale-overrides.json');

function buildSnippetLiquid() {
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  const lines = [
    '{%- comment -%} JT strings when Shopify IT locale is at translation key cap {%- endcomment -%}',
    '{%- assign jt_key = key | default: "" -%}',
    '{%- assign locale = request.locale.iso_code -%}',
    '{%- assign full_key = "jt." | append: jt_key -%}',
    '{%- assign override = "" -%}',
  ];

  for (const [locale, keys] of Object.entries(overrides)) {
    lines.push(`{%- if locale == "${locale}" -%}`);
    lines.push('{%- case jt_key -%}');
    for (const [k, text] of Object.entries(keys)) {
      const safe = String(text).replace(/"/g, '\\"');
      lines.push(`{%- when "${k}" -%}{%- assign override = "${safe}" -%}`);
    }
    lines.push('{%- endcase -%}');
    lines.push('{%- endif -%}');
  }

  lines.push('{%- if override != "" -%}{{ override }}{%- else -%}{{ full_key | t }}{%- endif -%}');
  return lines.join('\n');
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

const RENDER = {
  whatsapp: "{% render 'jt-locale-string', key: 'contact.whatsapp_title' %}",
  email: "{% render 'jt-locale-string', key: 'contact.email_title' %}",
  reply: "{% render 'jt-locale-string', key: 'contact.reply_one_day' %}",
  rights: "{% render 'jt-locale-string', key: 'footer.rights_reserved' %}",
  privacy: "{% render 'jt-locale-string', key: 'footer.privacy' %}",
  terms: "{% render 'jt-locale-string', key: 'footer.terms' %}",
};

const DELIVERY_ALT_RENDER =
  'alt="{% render \'jt-locale-string\', key: \'product.delivery_icon_alt\' %}"';

const LIQUID_REPLACEMENTS = [
  [
    'alt="{{ \'jt.product.delivery_icon_alt\' | t }}"',
    DELIVERY_ALT_RENDER,
  ],
  ['alt="Bezorgicoon"', DELIVERY_ALT_RENDER],
  ["{{ 'jt.contact.whatsapp_title' | t }}", RENDER.whatsapp],
  ["{{ 'jt.contact.email_title' | t }}", RENDER.email],
  ["{{ 'jt.contact.reply_one_day' | t }}", RENDER.reply],
  ["{{ 'jt.footer.rights_reserved' | t }}", RENDER.rights],
  ["{{ 'jt.footer.privacy' | t }}", RENDER.privacy],
  ["{{ 'jt.footer.terms' | t }}", RENDER.terms],
];

/**
 * Upload jt-locale-string.liquid and wire sections to use it (IT + capped locales).
 * @param {string} [themeGid]
 */
async function deployJtLocaleFallback(themeGid) {
  const theme = themeGid ? { id: themeGid } : await getMainTheme();
  if (!theme?.id) throw new Error('No theme');

  await putThemeAsset(theme.id, 'snippets/jt-locale-string.liquid', buildSnippetLiquid());

  const assets = [
    'sections/three-column-contact.liquid',
    'sections/footer.liquid',
    'snippets/dynamic-shipping-calculator.liquid',
  ];
  const patched = [];
  for (const assetKey of assets) {
    const id = theme.id.split('/').pop();
    const res = await limiter.schedule(() =>
      axios.get(`${config.shopify.adminBaseUrl}/themes/${id}/assets.json`, {
        params: { 'asset[key]': assetKey },
        headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
      })
    );
    let content = res.data?.asset?.value || '';
    let changed = false;
    for (const [from, to] of LIQUID_REPLACEMENTS) {
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

  return { themeGid: theme.id, snippet: 'snippets/jt-locale-string.liquid', patched };
}

module.exports = { deployJtLocaleFallback, buildSnippetLiquid };
