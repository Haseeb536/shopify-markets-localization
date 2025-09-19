const { config } = require('../config');

/**
 * Blocks API routes that call Shopify Admin until a token exists (env or OAuth file).
 */
function requireShopifyAdminToken(req, res, next) {
  if (!config.shopify.accessToken) {
    return res.status(503).json({
      ok: false,
      error:
        'Missing Shopify Admin API token. Set SHOPIFY_ACCESS_TOKEN in .env or complete OAuth: GET /api/auth/shopify/install?shop=YOURSTORE.myshopify.com',
    });
  }
  next();
}

module.exports = { requireShopifyAdminToken };
