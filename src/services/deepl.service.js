const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const { logger } = require('../utils/logger');

const DEEPL_DETECTED_PATH = path.join(process.cwd(), 'data', 'deepl-api-base.json');

/** Prefer npm run test:deepl result so we do not flip Pro ↔ Free on transient 403s. */
function getVerifiedDeepLApiBase() {
  try {
    const j = JSON.parse(fs.readFileSync(DEEPL_DETECTED_PATH, 'utf8'));
    const base = String(j.apiBase || '').replace(/\/$/, '');
    const working = Array.isArray(j.working) ? j.working.map((u) => String(u).replace(/\/$/, '')) : [];
    if (base && working.includes(base)) return base;
  } catch {
    /* optional */
  }
  return null;
}

const limiter = new RateLimiter(config.queue.deeplRps);

/**
 * Shopify locale → DeepL language codes.
 * Source: NL (Dutch). Targets: DE, FR, EN-GB, IT, ES, PL.
 */

/** DeepL target_lang (British English for Shopify "en" targets). */
const LOCALE_TO_DEEPL_TARGET = {
  de: 'DE',
  fr: 'FR',
  en: 'EN-GB',
  it: 'IT',
  es: 'ES',
  pl: 'PL',
  nl: 'NL',
};

/** DeepL source_lang — must use EN, not EN-GB (DeepL rejects EN-GB as source). */
const LOCALE_TO_DEEPL_SOURCE = {
  de: 'DE',
  fr: 'FR',
  en: 'EN',
  it: 'IT',
  es: 'ES',
  pl: 'PL',
  nl: 'NL',
};

/** DeepL requires header auth (legacy form auth_key was deprecated). */
function deeplRequestHeaders(contentType = 'application/x-www-form-urlencoded') {
  return {
    'Content-Type': contentType,
    Authorization: `DeepL-Auth-Key ${config.deepl.apiKey}`,
  };
}

function toDeepLTarget(shopifyLocale) {
  const key = String(shopifyLocale).toLowerCase().split('-')[0];
  return LOCALE_TO_DEEPL_TARGET[key] || key.toUpperCase();
}

function toDeepLSource(shopifyLocale) {
  const key = String(shopifyLocale).toLowerCase().split('-')[0];
  return LOCALE_TO_DEEPL_SOURCE[key] || key.toUpperCase();
}

/**
 * Optional per-pair DeepL glossary UUIDs from env, e.g. DEEPL_GLOSSARY_ID_NL_IT=...
 * @param {string} targetLang DeepL target (DE, IT, …)
 * @param {string} sourceLang DeepL source (NL, …)
 */
function resolveDeepLGlossaryId(targetLang, sourceLang) {
  const pair = `${sourceLang}_${targetLang}`.replace(/-/g, '_');
  const specific = process.env[`DEEPL_GLOSSARY_ID_${pair}`];
  if (specific) return specific;
  const byTarget = process.env[`DEEPL_GLOSSARY_ID_${targetLang}`];
  if (byTarget) return byTarget;
  return process.env.DEEPL_GLOSSARY_ID || '';
}

/** @param {string} message DeepL error message */
function parseDeepLBaseFromWrongEndpointMessage(message) {
  const m = String(message).match(/https:\/\/api(?:-free)?\.deepl\.com\b/i);
  if (!m) return null;
  return m[0].replace(/\/$/, '').toLowerCase().includes('api-free')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
}

function getDeepLGlossaryStatus() {
  const targets = ['DE', 'FR', 'EN', 'IT', 'ES', 'PL'];
  const source = toDeepLSource(config.locales.source);
  const out = {};
  for (const t of targets) {
    out[t] = resolveDeepLGlossaryId(t, source) ? 'configured' : 'missing';
  }
  out.postGlossary = 'motorsport-terminology.json (always applied after DeepL)';
  return out;
}

/**
 * @param {string[]} texts
 * @param {string} targetLocale
 * @param {{ html?: boolean }} [opts]
 */
async function translateBatch(texts, targetLocale, opts = {}) {
  const targetLang = toDeepLTarget(targetLocale);
  const sourceLang = opts.sourceLocale
    ? toDeepLSource(opts.sourceLocale)
    : toDeepLSource(config.locales.source);
  const nonEmpty = texts.map((t, i) => ({ i, t: t == null ? '' : String(t) }));
  const toTranslate = nonEmpty.filter((x) => x.t.trim().length > 0);
  if (!toTranslate.length) {
    return texts.map((t) => (t == null ? '' : String(t)));
  }

  return limiter.schedule(async () => {
    const body = new URLSearchParams();
    body.append('source_lang', sourceLang);
    body.append('target_lang', targetLang);
    if (opts.html) {
      body.append('tag_handling', 'html');
    }
    for (const item of toTranslate) {
      body.append('text', item.t);
    }
    const glossaryId = resolveDeepLGlossaryId(targetLang, sourceLang);
    if (glossaryId) {
      body.append('glossary_id', glossaryId);
    }
    const postTranslate = async (apiBase) => {
      const url = `${apiBase.replace(/\/$/, '')}/v2/translate`;
      return axios.post(url, body.toString(), {
        headers: deeplRequestHeaders(),
        timeout: 120000,
      });
    };

    try {
      const res = await postTranslate(config.deepl.apiBase);
      const translations = res.data.translations || [];
      const out = [...texts].map((t) => (t == null ? '' : String(t)));
      toTranslate.forEach((item, idx) => {
        const tr = translations[idx];
        out[item.i] = tr && tr.text != null ? tr.text : out[item.i];
      });
      return out;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const quotaExceeded =
        status === 456 ||
        (typeof data === 'object' && data?.message === 'Quota exceeded');
      logger.error('deepl_api_error', {
        status,
        message: err.message,
        data: typeof data === 'object' ? data : String(data),
        targetLang,
        sourceLang,
        quotaExceeded,
      });
      if (quotaExceeded) {
        const e = new Error('DeepL quota exceeded — pause bulk jobs until quota resets or upgrade plan');
        e.code = 'DEEPL_QUOTA_EXCEEDED';
        throw e;
      }
      const wrongEndpoint =
        status === 403 &&
        typeof data?.message === 'string' &&
        /wrong endpoint/i.test(data.message);

      if (wrongEndpoint && !opts._endpointRetried) {
        const verified = getVerifiedDeepLApiBase();
        const correctBase =
          verified || parseDeepLBaseFromWrongEndpointMessage(data.message);

        if (correctBase && correctBase !== config.deepl.apiBase) {
          logger.warn('deepl_endpoint_auto_switch', {
            from: config.deepl.apiBase,
            to: correctBase,
          });
          config.deepl.apiBase = correctBase;
          // Retry in-process (do not recurse into translateBatch — deadlocks the rate limiter)
          const res = await postTranslate(config.deepl.apiBase);
          const translations = res.data.translations || [];
          const out = [...texts].map((t) => (t == null ? '' : String(t)));
          toTranslate.forEach((item, idx) => {
            const tr = translations[idx];
            out[item.i] = tr && tr.text != null ? tr.text : out[item.i];
          });
          return out;
        }
      }

      if (wrongEndpoint) {
        const e = new Error(
          `DeepL endpoint mismatch. Set DEEPL_API_BASE in .env to ${config.deepl.apiBase.includes('api-free') ? 'https://api.deepl.com (Pro)' : 'https://api-free.deepl.com (free :fx)'}`
        );
        e.code = 'DEEPL_WRONG_ENDPOINT';
        throw e;
      }
      throw err;
    }
  });
}

function isLikelyHtmlField(key) {
  const k = String(key).toLowerCase();
  return (
    k.includes('body_html') ||
    k.includes('body') ||
    k.includes('content') ||
    k.includes('description_html') ||
    k.includes('summary_html')
  );
}

/**
 * Translate a list of items with shared html flag derived from key.
 * @param {Array<{ key: string, text: string }>} items
 * @param {string} targetLocale
 * @param {string} [sourceLocale] Shopify locale code for source text (e.g. nl, en)
 */
async function translateContentItems(items, targetLocale, sourceLocale) {
  if (!items.length) return [];
  const htmlKeys = new Set(items.filter((i) => isLikelyHtmlField(i.key)).map((_, idx) => idx));
  const plain = items.filter((_, idx) => !htmlKeys.has(idx));
  const html = items.filter((_, idx) => htmlKeys.has(idx));
  const deeplOpts = { sourceLocale: sourceLocale || config.locales.source };

  const results = new Array(items.length);
  if (plain.length) {
    const translated = await translateBatch(
      plain.map((p) => p.text),
      targetLocale,
      { html: false, ...deeplOpts }
    );
    let j = 0;
    items.forEach((item, idx) => {
      if (!htmlKeys.has(idx)) {
        results[idx] = translated[j++];
      }
    });
  }
  if (html.length) {
    const translated = await translateBatch(
      html.map((p) => p.text),
      targetLocale,
      { html: true, ...deeplOpts }
    );
    let j = 0;
    items.forEach((item, idx) => {
      if (htmlKeys.has(idx)) {
        results[idx] = translated[j++];
      }
    });
  }
  return results;
}

function isDeepLQuotaError(err) {
  return (
    err?.code === 'DEEPL_QUOTA_EXCEEDED' ||
    err?.response?.status === 456 ||
    (typeof err?.response?.data === 'object' && err?.response?.data?.message === 'Quota exceeded')
  );
}

module.exports = {
  translateBatch,
  translateContentItems,
  toDeepLTarget,
  toDeepLSource,
  resolveDeepLGlossaryId,
  getDeepLGlossaryStatus,
  isLikelyHtmlField,
  isDeepLQuotaError,
};
