/**
 * Central configuration loaded from environment variables.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

function normalizeStore(store) {
  if (!store) return '';
  const s = String(store).trim().replace(/^https?:\/\//, '');
  return s.endsWith('.myshopify.com') ? s : `${s}.myshopify.com`;
}

function parseLocales(raw, fallback) {
  if (!raw || !String(raw).trim()) return fallback;
  return String(raw)
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

const DEEPL_FREE_BASE = 'https://api-free.deepl.com';
const DEEPL_PRO_BASE = 'https://api.deepl.com';

const DEEPL_DETECTED_PATH = path.join(process.cwd(), 'data', 'deepl-api-base.json');

/**
 * DeepL API host — never guess from key suffix (:fx can still be Pro).
 * Priority: DEEPL_API_BASE in .env → data/deepl-api-base.json (npm run test:deepl) → Pro default.
 */
function resolveDeepLApiBase(_apiKey, explicitBase) {
  const explicit = explicitBase && String(explicitBase).trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  try {
    const raw = fs.readFileSync(DEEPL_DETECTED_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (j.apiBase) return String(j.apiBase).replace(/\/$/, '');
  } catch {
    /* run npm run test:deepl once */
  }

  return DEEPL_PRO_BASE;
}

/**
 * Admin API token: env first, then JSON file written by OAuth callback.
 */
function resolveShopifyAccessToken() {
  const envTok = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (envTok) return envTok;
  const tokenPath =
    process.env.SHOPIFY_TOKEN_PATH || path.join(process.cwd(), 'data', 'shopify-token.json');
  try {
    const raw = fs.readFileSync(tokenPath, 'utf8');
    const j = JSON.parse(raw);
    if (j.access_token) return String(j.access_token).trim();
  } catch {
    /* missing file or invalid JSON */
  }
  return '';
}

// Collections are included under read_products / write_products (no read_collections scope).
const defaultOAuthScopes = [
  'read_products',
  'write_products',
  'read_content',
  'write_content',
  'read_translations',
  'write_translations',
  'read_online_store_pages',
  'write_online_store_pages',
  'read_themes',
  'write_themes',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_locales',
  'write_locales',
].join(',');

const {
  SOURCE_LOCALE,
  DEFAULT_TARGET_LOCALES,
  filterTargetsExcludingSource,
} = require('./markets');

const sourceLocale = (process.env.SOURCE_LOCALE || SOURCE_LOCALE).toLowerCase();
const targetLocales = filterTargetsExcludingSource(
  parseLocales(process.env.TARGET_LOCALES, DEFAULT_TARGET_LOCALES),
  sourceLocale
);

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  shopify: {
    store: normalizeStore(process.env.SHOPIFY_STORE),
    accessToken: resolveShopifyAccessToken(),
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-01',
    oauth: {
      clientId: (process.env.SHOPIFY_CLIENT_ID || '').trim(),
      appBaseUrl: String(process.env.APP_BASE_URL || '')
        .trim()
        .replace(/\/$/, ''),
      scopes: (process.env.SHOPIFY_SCOPES || defaultOAuthScopes).trim(),
    },
    get adminBaseUrl() {
      return `https://${this.store}/admin/api/${this.apiVersion}`;
    },
    get graphqlUrl() {
      return `https://${this.store}/admin/api/${this.apiVersion}/graphql.json`;
    },
  },

  locales: {
    source: sourceLocale,
    targets: targetLocales,
  },

  deepl: {
    apiKey: process.env.DEEPL_API_KEY || '',
    apiBase: resolveDeepLApiBase(
      process.env.DEEPL_API_KEY || '',
      process.env.DEEPL_API_BASE
    ),
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  },

  queue: {
    name: 'shopify-translations',
    concurrency: parseInt(process.env.TRANSLATION_QUEUE_CONCURRENCY || '3', 10),
    /** Parallel products in inline catalog sync (text-only / no-redis runs). */
    productConcurrency: parseInt(process.env.PRODUCT_TRANSLATE_CONCURRENCY || '6', 10),
    shopifyRps: parseFloat(process.env.SHOPIFY_REQUESTS_PER_SECOND || '2'),
    deeplRps: parseFloat(process.env.DEEPL_REQUESTS_PER_SECOND || '5'),
    attempts: parseInt(process.env.JOB_ATTEMPTS || '5', 10),
    backoffMs: parseInt(process.env.JOB_BACKOFF_MS || '5000', 10),
  },

  control: {
    /** When true, webhook handlers acknowledge but do not enqueue jobs */
    webhooksDisabled: process.env.DISABLE_WEBHOOKS === 'true',
    /** When true, workers should not process jobs (checked at job start) */
    workersDisabled: process.env.DISABLE_WORKERS === 'true',
  },

  paths: {
    glossary: process.env.GLOSSARY_PATH || 'config/glossary.json',
  },
};

function assertRequired() {
  const missing = [];
  if (!config.shopify.store) missing.push('SHOPIFY_STORE');
  if (!config.shopify.accessToken) {
    missing.push('SHOPIFY_ACCESS_TOKEN or OAuth token file (see README /api/auth/shopify/install)');
  }
  if (!config.deepl.apiKey) missing.push('DEEPL_API_KEY');
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}

function assertWebhookSecret() {
  if (!config.shopify.apiSecret) {
    throw new Error('SHOPIFY_API_SECRET is required for webhook endpoints');
  }
}

module.exports = { config, assertRequired, assertWebhookSecret, normalizeStore };
