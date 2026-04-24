const express = require('express');
const chatStore = require('../services/chatStore.js');
const { notifyThreadsChanged } = require('../socket/realtime.js');

/**
 * @param {import('express').RequestHandler} authMiddleware
 */
function createThreadsRouter(authMiddleware) {
  const r = express.Router();

  r.get('/threads', authMiddleware, async (req, res) => {
    try {
      res.json(await chatStore.getThreads(req.userId));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_list_threads' });
    }
  });

  r.get('/threads/:threadId/presence', authMiddleware, async (req, res) => {
    try {
      const { threadId } = req.params;
      const data = await chatStore.getThreadPresenceForViewer(threadId, req.userId);
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_load_presence' });
    }
  });

  r.get('/threads/:threadId/messages', authMiddleware, async (req, res) => {
    try {
      const { threadId } = req.params;
      res.json(await chatStore.getMessages(threadId, req.userId));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_load_messages' });
    }
  });

  r.post('/threads/:threadId/messages', authMiddleware, async (req, res) => {
    try {
      const { threadId } = req.params;
      const bodyText = req.body?.text;
      if (typeof bodyText !== 'string' || !bodyText.trim()) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      const msg = await chatStore.addMessage(threadId, bodyText.trim(), req.userId);
      if (!msg) {
        res.status(404).json({ error: 'thread not found' });
        return;
      }
      notifyThreadsChanged();
      res.status(201).json(msg);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_send' });
    }
  });

  return r;
}

module.exports = { createThreadsRouter };
