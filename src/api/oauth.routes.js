const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { config, normalizeStore } = require('../config');
const { exchangeAccessToken } = require('../services/shopify.oauth.service');
const { logger } = require('../utils/logger');

const router = express.Router();

/** @type {Map<string, { shop: string, expires: number }>} */
const pendingStates = new Map();

function cleanupStates() {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v.expires < now) pendingStates.delete(k);
  }
}

/**
 * Start OAuth: browser hits this URL, then Shopify redirects back to /callback
 * @example GET /api/auth/shopify/install?shop=5755fd-01.myshopify.com
 */
router.get('/shopify/install', (req, res) => {
  cleanupStates();
  const shop = normalizeStore(req.query.shop || config.shopify.store);
  if (!shop) {
    return res.status(400).type('html')
      .send(`<p>Missing <code>?shop=your-store.myshopify.com</code></p>`);
  }
  if (!config.shopify.oauth.clientId) {
    return res.status(500).type('html').send(`<p>Set <code>SHOPIFY_CLIENT_ID</code> in .env</p>`);
  }
  if (!config.shopify.oauth.appBaseUrl) {
    return res.status(500).type('html')
      .send(`<p>Set <code>APP_BASE_URL</code> to your public HTTPS base (ngrok, Cloudflare Tunnel, etc.)</p>`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { shop, expires: Date.now() + 10 * 60 * 1000 });
  const redirectUri = `${config.shopify.oauth.appBaseUrl}/api/auth/shopify/callback`;
  const scopes = config.shopify.oauth.scopes;
  const url =
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${encodeURIComponent(config.shopify.oauth.clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

router.get('/shopify/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    const shop = req.query.shop;
    if (!code || !state || !shop) {
      return res.status(400).type('html').send('<p>Missing code, state, or shop from Shopify.</p>');
    }
    const rec = pendingStates.get(String(state));
    pendingStates.delete(String(state));
    if (!rec || rec.expires < Date.now()) {
      return res.status(400).type('html')
        .send('<p>Invalid or expired <code>state</code>. Open <code>/api/auth/shopify/install</code> again.</p>');
    }
    const shopHost = normalizeStore(String(shop));
    if (shopHost !== rec.shop) {
      return res.status(400).type('html').send('<p>Shop does not match the install session.</p>');
    }
    if (!config.shopify.oauth.clientId || !config.shopify.apiSecret) {
      return res.status(500).type('html').send('<p>Missing SHOPIFY_CLIENT_ID or SHOPIFY_API_SECRET in .env</p>');
    }

    const data = await exchangeAccessToken(
      shopHost,
      String(code),
      config.shopify.oauth.clientId,
      config.shopify.apiSecret
    );
    const access_token = data?.access_token;
    if (!access_token) {
      return res.status(500).type('html').send(`<p>No access_token in response: ${escapeHtml(JSON.stringify(data))}</p>`);
    }

    const tokenPath =
      process.env.SHOPIFY_TOKEN_PATH || path.join(process.cwd(), 'data', 'shopify-token.json');
    const dir = path.dirname(tokenPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      access_token,
      scope: data.scope,
      shop: shopHost,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(tokenPath, JSON.stringify(payload, null, 2), 'utf8');
    logger.info('shopify_oauth_token_saved', { shop: shopHost, tokenPath });

    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title></head><body>
<h1>Shopify Admin connected</h1>
<p>Token saved to <code>${escapeHtml(tokenPath)}</code>.</p>
<p><strong>Restart</strong> the API process and the worker so they reload configuration, or copy <code>access_token</code> into <code>SHOPIFY_ACCESS_TOKEN</code> in <code>.env</code>.</p>
</body></html>`);
  } catch (e) {
    const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    logger.error('shopify_oauth_callback_failed', { message: e.message });
    res.status(500).type('html').send(`<p>OAuth failed: ${escapeHtml(String(msg))}</p>`);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
