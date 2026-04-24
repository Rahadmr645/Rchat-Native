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
const { authMiddleware, verifyAccessToken } = require('./middleware/auth.middleware.js');
const { registerChatSocket } = require('./socket/chat.socket.js');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  const { client, db } = await connectMongo();
  await chatStore.init(db);
  await usersStore.init(db);
  await friendsStore.init(db);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'rchat-server', db: 'mongodb' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/friends', friendsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api', createThreadsRouter(authMiddleware));
  app.use('/api', createWebrtcRouter(authMiddleware));

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  registerChatSocket(io, { verifyAccessToken });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RChat server listening on http://0.0.0.0:${PORT} (reachable from LAN/emulator)`);
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
