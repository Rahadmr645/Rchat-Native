const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware.js');
const friendsStore = require('../services/friendsStore.js');
const usersStore = require('../services/usersStore.js');
const pushNotify = require('../services/pushNotify.js');
const { notifyThreadsChanged } = require('../socket/realtime.js');

const router = express.Router();
router.use(authMiddleware);

router.post('/request', async (req, res) => {
  try {
    const email = req.body?.email;
    if (typeof email !== 'string') {
      res.status(400).json({ error: 'email_required' });
      return;
    }
    const result = await friendsStore.createFriendRequest(req.userId, email);
    if (!result.ok) {
      const status =
        result.code === 'user_not_found'
          ? 404
          : result.code === 'cannot_add_self'
            ? 400
            : 409;
      res.status(status).json({ error: result.code, message: result.message });
      return;
    }
    const fromUser = await usersStore.findUserById(req.userId);
    if (result.toUserId) {
      void pushNotify.notifyFriendRequest(String(result.toUserId), fromUser?.name || 'Someone');
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'friend_request_failed' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const data = await friendsStore.listRequestsForUser(req.userId);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'list_requests_failed' });
  }
});

/** Registered users (except self) with relation: none | friends | pending_out | pending_in */
router.get('/directory', async (req, res) => {
  try {
    const users = await friendsStore.listExploreUsers(req.userId);
    res.json({ users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'list_directory_failed' });
  }
});

router.post('/requests/:requestId/accept', async (req, res) => {
  try {
    const result = await friendsStore.acceptRequest(req.params.requestId, req.userId);
    if (!result.ok) {
      const status = result.code === 'forbidden' ? 403 : result.code === 'invalid_request' ? 400 : 404;
      res.status(status).json({ error: result.code, message: result.message });
      return;
    }
    notifyThreadsChanged();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'accept_failed' });
  }
});

router.post('/requests/:requestId/decline', async (req, res) => {
  try {
    const result = await friendsStore.declineRequest(req.params.requestId, req.userId);
    if (!result.ok) {
      const status = result.code === 'forbidden' ? 403 : result.code === 'invalid_request' ? 400 : 404;
      res.status(status).json({ error: result.code, message: result.message });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'decline_failed' });
  }
});

module.exports = router;
