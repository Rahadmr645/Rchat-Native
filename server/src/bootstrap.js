const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectMongo } = require('./db/mongoClient.js');
const chatStore = require('./services/chatStore.js');
const usersStore = require('./services/usersStore.js');
const friendsStore = require('./services/friendsStore.js');
const { createAuthRouter } = require('./routes/auth.routes.js');
const friendsRouter = require('./routes/friends.routes.js');
const pushRouter = require('./routes/push.routes.js');
const { createThreadsRouter } = require('./routes/threads.routes.js');
const { createWebrtcRouter } = require('./routes/webrtc.routes.js');
const { createUploadsRouter } = require('./routes/uploads.routes.js');
const { authMiddleware, verifyAccessToken } = require('./middleware/auth.middleware.js');
const { registerChatSocket } = require('./socket/chat.socket.js');
const { tryInitFirebaseAdmin } = require('./config/initFirebaseAdmin.js');

const PORT = Number.parseInt(String(process.env.PORT || '3000'), 10) || 3000;

async function start() {
  console.log('[startup] Booting server...');
  tryInitFirebaseAdmin();
  console.log(`[startup] PORT=${process.env.PORT || '3000'} RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT || 'false'}`);
  const { client, db } = await connectMongo();
  console.log('[startup] MongoDB connected.');
  await chatStore.init(db);
  await usersStore.init(db);
  await friendsStore.init(db);
  console.log('[startup] Stores initialized.');

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'rchat-server', db: 'mongodb' });
  });

  /** Some checks hit `/`; return 200 immediately (avoid 404-only root on cold health probes). */
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'rchat-server', db: 'mongodb' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/friends', friendsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api', createThreadsRouter(authMiddleware));
  app.use('/api', createWebrtcRouter(authMiddleware));
  app.use('/api', createUploadsRouter(authMiddleware));

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  registerChatSocket(io, { verifyAccessToken });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RChat server listening on 0.0.0.0:${PORT} (reachable from LAN/emulator)`);
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log(
        `[railway] Public URL must target port ${PORT} (match PORT env). If the browser shows 502, open Networking for this service and set the domain’s target port to ${PORT}, or clear a fixed port of 3000.`,
      );
    }
  });

  const shutdown = async () => {
    try {
      await client.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start };
