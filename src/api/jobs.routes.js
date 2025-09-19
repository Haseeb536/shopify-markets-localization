const express = require('express');
const { requireShopifyAdminToken } = require('../middleware/requireShopifyAdminToken');
const { enqueueTranslation } = require('../queues/enqueue');
const { Gid, getMainTheme } = require('../services/shopify.service');

const router = express.Router();
router.use(requireShopifyAdminToken);
router.use(express.json({ limit: '256kb' }));

router.post('/jobs/translate/product/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('product', { resourceGid: Gid.product(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.product(id) });
});

router.post('/jobs/translate/collection/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('collection', { resourceGid: Gid.collection(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.collection(id) });
});

router.post('/jobs/translate/page/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('page', { resourceGid: Gid.page(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.page(id) });
});

router.post('/jobs/translate/article/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('article', { resourceGid: Gid.article(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.article(id) });
});

router.post('/jobs/translate/blog/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('blog', { resourceGid: Gid.blog(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.blog(id) });
});

router.post('/jobs/translate/menu/:id', async (req, res) => {
  const id = req.params.id;
  await enqueueTranslation('menu', { resourceGid: Gid.menu(id), topic: 'manual' });
  res.json({ ok: true, queued: Gid.menu(id) });
});

router.post('/jobs/translate/theme', async (req, res) => {
  const theme = await getMainTheme();
  if (!theme?.id) {
    return res.status(400).json({ ok: false, error: 'No MAIN theme' });
  }
  await enqueueTranslation('theme', { resourceGid: theme.id, topic: 'manual' });
  res.json({ ok: true, queued: theme.id });
});

router.post('/jobs/theme-locale', async (req, res) => {
  const { themeGid, sourceAssetKey, assetKeyByLocale } = req.body || {};
  if (!themeGid || !sourceAssetKey) {
    return res.status(400).json({ ok: false, error: 'themeGid and sourceAssetKey required' });
  }
  await enqueueTranslation('theme-locale', { themeGid, sourceAssetKey, assetKeyByLocale });
  res.json({ ok: true, queued: true });
});

module.exports = router;
