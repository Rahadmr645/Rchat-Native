const express = require('express');
const usersStore = require('../services/usersStore.js');
const chatStore = require('../services/chatStore.js');
const { notifyThreadsChanged } = require('../socket/realtime.js');
const { authMiddleware, signToken } = require('../middleware/auth.middleware.js');

function isAllowedAvatarUrl(value) {
  if (value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  const u = value.trim();
  if (u.length < 8 || u.length > 2048) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return true;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row._id.toString(),
    email: row.email,
    name: row.name,
    avatarUrl:
      typeof row.avatarUrl === 'string' && row.avatarUrl.trim() ? row.avatarUrl.trim() : null,
  };
}

function createAuthRouter() {
  const r = express.Router();

  r.post('/register', async (req, res) => {
    try {
      const email = req.body?.email;
      const password = req.body?.password;
      const name = req.body?.name;
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'email_and_password_required' });
        return;
      }
      if (!usersStore.isValidEmail(email)) {
        res.status(400).json({ error: 'invalid_email' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'password_too_short' });
        return;
      }
      const user = await usersStore.createUser(email, password, name);
      const token = signToken(user.id);
      const full = await usersStore.findUserById(user.id);
      res.status(201).json({ user: publicUser(full), token });
    } catch (e) {
      if (e && e.code === 11000) {
        res.status(409).json({ error: 'email_already_registered' });
        return;
      }
      console.error(e);
      res.status(500).json({ error: 'register_failed' });
    }
  });

  r.post('/login', async (req, res) => {
    try {
      const email = req.body?.email;
      const password = req.body?.password;
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'email_and_password_required' });
        return;
      }
      const user = await usersStore.verifyPassword(email, password);
      if (!user) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      const token = signToken(user.id);
      const full = await usersStore.findUserById(user.id);
      res.json({ user: publicUser(full), token });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'login_failed' });
    }
  });

  r.get('/me', authMiddleware, async (req, res) => {
    try {
      const row = await usersStore.findUserById(req.userId);
      if (!row) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }
      res.json({ user: publicUser(row) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'me_failed' });
    }
  });

  r.patch('/me', authMiddleware, async (req, res) => {
    try {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'avatarUrl')) {
        res.status(400).json({ error: 'avatarUrl_required' });
        return;
      }
      const raw = req.body.avatarUrl;
      if (raw !== null && typeof raw !== 'string') {
        res.status(400).json({ error: 'invalid_avatar_url' });
        return;
      }
      if (!isAllowedAvatarUrl(raw)) {
        res.status(400).json({ error: 'invalid_avatar_url' });
        return;
      }
      const normalized = raw === null || raw === '' ? null : String(raw).trim();
      await usersStore.setAvatarUrl(req.userId, normalized);
      await chatStore.updateMemberAvatarInAllDmThreads(req.userId, normalized);
      notifyThreadsChanged();
      const row = await usersStore.findUserById(req.userId);
      res.json({ user: publicUser(row) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'profile_update_failed' });
    }
  });

  return r;
}

module.exports = { createAuthRouter };
