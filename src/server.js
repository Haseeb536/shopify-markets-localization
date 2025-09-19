require('dotenv').config();

const express = require('express');
const path = require('path');
const { config } = require('./config');
const { shopifyWebhookController } = require('./controllers/webhook.controller');
const oauthRoutes = require('./api/oauth.routes');
const controlRoutes = require('./api/control.routes');
const jobsRoutes = require('./api/jobs.routes');
const { logger } = require('./utils/logger');

const app = express();

/** Shopify Dev Dashboard "App URL" often opens GET / — avoid "Cannot GET /". */
app.get('/', (req, res) => {
  const shop = req.query.shop || config.shopify.store;
  if (shop && config.shopify.oauth.clientId && config.shopify.oauth.appBaseUrl) {
    const q = new URLSearchParams({ shop: String(shop) });
    return res.redirect(302, `/api/auth/shopify/install?${q.toString()}`);
  }
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>JT Localization</title></head><body>
<h1>Shopify Markets localization API</h1>
<p>Status: ${config.shopify.accessToken ? 'Shopify token configured' : 'Not connected yet'}</p>
<p><a href="/health">/health</a></p>
<p>Connect store (OAuth):</p>
<p><a href="/api/auth/shopify/install?shop=${encodeURIComponent(config.shopify.store || 'YOUR-STORE.myshopify.com')}">Install on ${config.shopify.store || 'your store'}</a></p>
<p>Set <code>APP_BASE_URL</code> in .env to this ngrok URL. In Dev Dashboard, set redirect URL to:<br>
<code>{APP_BASE_URL}/api/auth/shopify/callback</code></p>
</body></html>`);
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-localization',
    env: config.nodeEnv,
    shopifyTokenConfigured: Boolean(config.shopify.accessToken),
    locales: {
      source: config.locales.source,
      targets: config.locales.targets,
    },
  });
});

app.post('/webhooks/shopify', express.raw({ type: 'application/json', limit: '5mb' }), shopifyWebhookController);

app.use('/api/auth', oauthRoutes);

app.use(express.json({ limit: '1mb' }));
app.use('/api', controlRoutes);
app.use('/api', jobsRoutes);

app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use((err, _req, res, _next) => {
  logger.error('http_error', { message: err.message, stack: err.stack });
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(config.port, () => {
  logger.info('server_listen', { port: config.port });
  if (!config.shopify.accessToken) {
    logger.warn('shopify_token_missing', {
      hint: 'Open /api/auth/shopify/install?shop=YOURSTORE.myshopify.com (set APP_BASE_URL + SHOPIFY_CLIENT_ID first)',
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Listening on http://localhost:${config.port}`);
});

module.exports = app;
