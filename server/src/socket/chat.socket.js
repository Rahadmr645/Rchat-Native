const { setRealtime, notifyThreadsChanged } = require('./realtime.js');
const chatStore = require('../services/chatStore.js');
const presenceStore = require('../services/presenceStore.js');
const usersStore = require('../services/usersStore.js');
const pushNotify = require('../services/pushNotify.js');

function roomName(threadId) {
  return `thread:${threadId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ verifyAccessToken: (token: string) => string | null }} auth
 */
function registerChatSocket(io, { verifyAccessToken }) {
  setRealtime(io);

  io.use((socket, next) => {
    const raw = socket.handshake.auth?.token;
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token) {
      socket.userId = undefined;
      next();
      return;
    }
    const uid = verifyAccessToken(token);
    socket.userId = uid || undefined;
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      const uid = String(socket.userId);
      presenceStore.handleSocketConnected(uid, socket.id);
      socket.join(userRoom(uid));
    }

    socket.on('disconnect', () => {
      if (socket.userId) {
        void presenceStore.handleSocketDisconnected(String(socket.userId), socket.id);
      }
    });

    socket.on('join_thread', (threadId) => {
      if (typeof threadId !== 'string') return;
      socket.join(roomName(threadId));
    });

    socket.on('leave_thread', (threadId) => {
      if (typeof threadId !== 'string') return;
      socket.leave(roomName(threadId));
    });

    socket.on('send_message', async (payload) => {
      try {
        const threadId = payload?.threadId;
        const text = payload?.text;
        if (typeof threadId !== 'string' || typeof text !== 'string' || !text.trim()) {
          return;
        }
        const msg = await chatStore.addMessage(threadId, text.trim(), socket.userId);
        if (!msg) return;
        io.to(roomName(threadId)).emit('thread_message', { threadId, message: msg });
        notifyThreadsChanged();
        if (socket.userId) {
          const me = String(socket.userId);
          const other = await chatStore.getOtherDmMemberUserId(threadId, me);
          if (other && other !== me && !presenceStore.isUserOnline(other)) {
            const sender = await usersStore.findUserById(me);
            void pushNotify.notifyChatMessage(other, sender?.name, msg.text, threadId);
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('call_peer', async (payload) => {
      try {
        if (!socket.userId) return;
        const threadId = payload?.threadId;
        const callId = payload?.callId;
        const body = payload?.payload;
        if (typeof threadId !== 'string' || typeof callId !== 'string' || !body || typeof body !== 'object') {
          return;
        }
        const other = await chatStore.getOtherDmMemberUserId(threadId, String(socket.userId));
        if (!other) return;
        io.to(userRoom(other)).emit('call_peer', {
          threadId,
          callId,
          fromUserId: String(socket.userId),
          payload: body,
        });
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('call_end', async (payload) => {
      try {
        if (!socket.userId) return;
        const threadId = payload?.threadId;
        const callId = payload?.callId;
        if (typeof threadId !== 'string' || typeof callId !== 'string') return;
        const other = await chatStore.getOtherDmMemberUserId(threadId, String(socket.userId));
        if (!other) return;
        io.to(userRoom(other)).emit('call_ended', {
          threadId,
          callId,
          byUserId: String(socket.userId),
        });
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('call_decline', async (payload) => {
      try {
        if (!socket.userId) return;
        const threadId = payload?.threadId;
        const callId = payload?.callId;
        if (typeof threadId !== 'string' || typeof callId !== 'string') return;
        const other = await chatStore.getOtherDmMemberUserId(threadId, String(socket.userId));
        if (!other) return;
        io.to(userRoom(other)).emit('call_declined', {
          threadId,
          callId,
          byUserId: String(socket.userId),
        });
      } catch (e) {
        console.error(e);
      }
    });
  });
}

module.exports = { registerChatSocket };
