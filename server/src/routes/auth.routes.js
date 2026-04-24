const express = require('express');
const usersStore = require('../services/usersStore.js');
const { authMiddleware, signToken } = require('../middleware/auth.middleware.js');

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
      res.status(201).json({ user, token });
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
      res.json({ user, token });
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
      res.json({
        user: {
          id: row._id.toString(),
          email: row.email,
          name: row.name,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'me_failed' });
    }
  });

  return r;
}

module.exports = { createAuthRouter };
