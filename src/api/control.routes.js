const express = require('express');
const { requireShopifyAdminToken } = require('../middleware/requireShopifyAdminToken');
const { getControlFlags, setControlFlags, resetControlFlags } = require('../services/controlState.service');
const {
  pauseTranslationQueue,
  resumeTranslationQueue,
  isQueuePaused,
} = require('../queues/queue.control');
const { getTranslationQueue } = require('../queues/translation.queue');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireShopifyAdminToken);

router.get('/control/status', async (_req, res) => {
  const flags = await getControlFlags();
  const paused = await isQueuePaused();
  const counts = await getTranslationQueue().getJobCounts();
  res.json({ ok: true, flags, queuePaused: paused, jobCounts: counts });
});

router.post('/control/workers', express.json(), async (req, res) => {
  const disabled = Boolean(req.body?.disabled);
  const flags = await setControlFlags({ workersDisabled: disabled });
  logger.warn('control_workers', { disabled });
  res.json({ ok: true, flags });
});

router.post('/control/webhooks', express.json(), async (req, res) => {
  const disabled = Boolean(req.body?.disabled);
  const flags = await setControlFlags({ webhooksDisabled: disabled });
  logger.warn('control_webhooks', { disabled });
  res.json({ ok: true, flags });
});

router.post('/control/queue/pause', async (_req, res) => {
  await pauseTranslationQueue();
  res.json({ ok: true, queuePaused: true });
});

router.post('/control/queue/resume', async (_req, res) => {
  await resumeTranslationQueue();
  res.json({ ok: true, queuePaused: false });
});

router.post('/control/reset', async (_req, res) => {
  await resetControlFlags();
  res.json({ ok: true, message: 'control flags cleared to env defaults on next read' });
});

module.exports = router;
