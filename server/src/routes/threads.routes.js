const express = require('express');
const chatStore = require('../services/chatStore.js');
const { notifyThreadsChanged, emitThreadMessagesDeleted } = require('../socket/realtime.js');

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

  r.post('/threads/:threadId/messages/delete', authMiddleware, async (req, res) => {
    try {
      const { threadId } = req.params;
      const rawIds = req.body?.messageIds;
      const scope = req.body?.scope;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        res.status(400).json({ error: 'messageIds is required' });
        return;
      }
      if (scope !== 'me' && scope !== 'everyone') {
        res.status(400).json({ error: 'scope must be me or everyone' });
        return;
      }
      const messageIds = rawIds.map((x) => String(x).trim()).filter((x) => x.length > 0);
      const result = await chatStore.deleteMessages(threadId, req.userId, messageIds, scope);
      if (!result.ok) {
        const code = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 400;
        res.status(code).json({ error: result.error || 'delete_failed' });
        return;
      }
      const memberIds = await chatStore.getThreadMemberUserIds(threadId);
      emitThreadMessagesDeleted(threadId, memberIds, {
        threadId: String(threadId),
        messageIds: result.affectedIds || [],
        scope,
      });
      notifyThreadsChanged();
      res.json({
        ok: true,
        affectedIds: result.affectedIds,
        scope: result.scope,
        deletedCount: result.deletedCount,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_delete_messages' });
    }
  });

  return r;
}

module.exports = { createThreadsRouter };
