const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * Exchange OAuth authorization code for an Admin API access token.
 * @param {string} shopHost e.g. myshop.myshopify.com
 * @param {string} code
 * @param {string} clientId
 * @param {string} clientSecret App client secret from the same Shopify app
 */
async function exchangeAccessToken(shopHost, code, clientId, clientSecret) {
  const url = `https://${shopHost}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  try {
    const res = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    logger.error('shopify_oauth_exchange_error', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });
    throw err;
  }
}

module.exports = { exchangeAccessToken };
