const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware.js');
const usersStore = require('../services/usersStore.js');
const pushNotify = require('../services/pushNotify.js');

const router = express.Router();
router.use(authMiddleware);

function readToken(body) {
  const raw = body?.expoPushToken ?? body?.token;
  return typeof raw === 'string' ? raw.trim() : '';
}

router.post('/register', async (req, res) => {
  try {
    const token = readToken(req.body);
    if (!token || token.length > 512) {
      res.status(400).json({ error: 'expo_push_token_required' });
      return;
    }
    await usersStore.addExpoPushToken(req.userId, token);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'push_register_failed' });
  }
});

/** POST with Bearer token — sends a test notification to this account’s registered Expo tokens. */
router.post('/test', async (req, res) => {
  try {
    await pushNotify.notifyTest(req.userId);
    res.json({
      ok: true,
      hint: 'Watch server logs for [push]. Put the app in background; iOS simulator does not get remote pushes.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'push_test_failed' });
  }
});

router.post('/unregister', async (req, res) => {
  try {
    const token = readToken(req.body);
    if (!token) {
      res.status(400).json({ error: 'expo_push_token_required' });
      return;
    }
    await usersStore.removeExpoPushToken(req.userId, token);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'push_unregister_failed' });
  }
});

module.exports = router;
