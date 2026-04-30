const { setRealtime, notifyThreadsChanged, notifyThreadsChangedDebounced } = require('./realtime.js');
const chatStore = require('../services/chatStore.js');
const presenceStore = require('../services/presenceStore.js');
const usersStore = require('../services/usersStore.js');
const pushNotify = require('../services/pushNotify.js');
const notificationPrefsStore = require('../services/notificationPrefsStore.js');
const { buildStoredText, normalizeClientSummary } = require('../lib/callLogMessage.js');

function roomName(threadId) {
  return `thread:${threadId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

/**
 * Recipient has at least one connected socket joined to this thread room (chat is on screen).
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} threadId
 */
async function userIsViewingThread(io, userId, threadId) {
  const uid = String(userId || '');
  const tid = String(threadId || '');
  if (!uid || !tid) return false;
  try {
    const sockets = await io.in(roomName(tid)).fetchSockets();
    return sockets.some((s) => s.userId != null && String(s.userId) === uid);
  } catch {
    return false;
  }
}

/**
 * @param {import('socket.io').Server} io
 * @param {string} threadId
 * @param {Awaited<ReturnType<typeof chatStore.addMessage>>} msg
 * @param {string | undefined} senderUserId
 * @param {string | undefined} clientTempId
 * @param {{ skipPush?: boolean }} [opts]
 */
async function broadcastNewChatMessage(io, threadId, msg, senderUserId, clientTempId, opts) {
  if (!msg) return;
  const skipPush = Boolean(opts?.skipPush);
  io.to(roomName(threadId)).emit('thread_message', { threadId, message: msg, clientTempId });
  const memberUserIds = await chatStore.getThreadMemberUserIds(threadId);
  for (const uid of memberUserIds) {
    io.to(userRoom(uid)).emit('thread_message', { threadId, message: msg, clientTempId });
  }
  if (senderUserId) {
    const me = String(senderUserId);
    const recipientIds = memberUserIds.filter((uid) => uid !== me);
    const onlineRecipients = [];
    for (const uid of recipientIds) {
      const sockets = await io.in(userRoom(uid)).fetchSockets();
      if (sockets.length > 0) onlineRecipients.push(uid);
    }
    if (onlineRecipients.length > 0) {
      const changed = await chatStore.markMessageDelivered(msg.id, onlineRecipients);
      if (changed) {
        const statusPayload = { threadId, messageId: msg.id, deliveryStatus: 'delivered' };
        io.to(roomName(threadId)).emit('thread_message_status', statusPayload);
        io.to(userRoom(me)).emit('thread_message_status', statusPayload);
      }
    }
  }
  notifyThreadsChangedDebounced();
  if (skipPush || !senderUserId) return;
  const me = String(senderUserId);
  const other = await chatStore.getOtherDmMemberUserId(threadId, me);
  if (other && other !== me) {
    const viewing = await userIsViewingThread(io, other, threadId);
    const pushMuted = notificationPrefsStore.isThreadPushMuted(other, threadId);
    if (!viewing && !pushMuted) {
      const sender = await usersStore.findUserById(me);
      const badge = await chatStore.getTotalUnreadCountForUser(other);
      void pushNotify.notifyChatMessage(other, sender?.name, msg.text, threadId, {
        messageId: msg.id,
        badge,
      });
    }
  }
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
      // IMO-style: when the recipient reconnects, every message that was still
      // marked 'sent' becomes 'delivered'. Notify senders so single tick flips
      // to double tick everywhere instantly.
      void chatStore
        .markPendingMessagesDeliveredForUser(uid)
        .then((groups) => {
          if (!groups || groups.length === 0) return;
          for (const { threadId, messageIds } of groups) {
            for (const messageId of messageIds) {
              const statusPayload = {
                threadId,
                messageId,
                deliveryStatus: 'delivered',
              };
              io.to(roomName(threadId)).emit('thread_message_status', statusPayload);
            }
            void chatStore.getThreadMemberUserIds(threadId).then((memberIds) => {
              for (const memberId of memberIds) {
                if (memberId === uid) continue;
                for (const messageId of messageIds) {
                  io.to(userRoom(memberId)).emit('thread_message_status', {
                    threadId,
                    messageId,
                    deliveryStatus: 'delivered',
                  });
                }
              }
            });
          }
        })
        .catch((err) => console.error('[chat.socket] mark-delivered on connect failed', err));
    }

    socket.on('disconnect', () => {
      if (socket.userId) {
        void presenceStore.handleSocketDisconnected(String(socket.userId), socket.id);
      }
    });

    socket.on('join_thread', async (threadId) => {
      if (typeof threadId !== 'string') return;
      socket.join(roomName(threadId));
      if (socket.userId) {
        const readerUserId = String(socket.userId);
        const markResult = await chatStore.markThreadRead(threadId, readerUserId);
        if (markResult.changed) {
          notifyThreadsChanged();
          io.to(roomName(threadId)).emit('thread_seen', {
            threadId,
            readerUserId,
            seenMessageIds: markResult.seenMessageIds,
          });
          const memberUserIds = await chatStore.getThreadMemberUserIds(threadId);
          for (const uid of memberUserIds) {
            io.to(userRoom(uid)).emit('thread_seen', {
              threadId,
              readerUserId,
              seenMessageIds: markResult.seenMessageIds,
            });
          }
        }
      }
    });

    socket.on('leave_thread', (threadId) => {
      if (typeof threadId !== 'string') return;
      socket.leave(roomName(threadId));
    });

    socket.on('thread_push_mute', (payload) => {
      if (!socket.userId) return;
      const threadId = payload?.threadId;
      if (typeof threadId !== 'string' || !threadId.trim()) return;
      const muted = Boolean(payload?.muted);
      notificationPrefsStore.setThreadPushMuted(String(socket.userId), threadId.trim(), muted);
    });

    socket.on('thread_push_mute_sync', (payload) => {
      if (!socket.userId) return;
      const raw = payload?.threadIds;
      const threadIds = Array.isArray(raw)
        ? raw.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
        : [];
      notificationPrefsStore.replaceThreadPushMutes(String(socket.userId), threadIds);
    });

    socket.on('send_message', async (payload) => {
      try {
        const threadId = payload?.threadId;
        const text = payload?.text;
        const clientTempId = payload?.clientTempId;
        if (typeof threadId !== 'string' || typeof text !== 'string' || !text.trim()) {
          return;
        }
        const msg = await chatStore.addMessage(threadId, text.trim(), socket.userId);
        if (!msg) return;
        await broadcastNewChatMessage(io, threadId, msg, socket.userId, clientTempId, { skipPush: false });
        notifyThreadsChanged();
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('mark_thread_read', async (threadId) => {
      try {
        if (!socket.userId || typeof threadId !== 'string') return;
        const readerUserId = String(socket.userId);
        const markResult = await chatStore.markThreadRead(threadId, readerUserId);
        if (markResult.changed) {
          notifyThreadsChanged();
          io.to(roomName(threadId)).emit('thread_seen', {
            threadId,
            readerUserId,
            seenMessageIds: markResult.seenMessageIds,
          });
          const memberUserIds = await chatStore.getThreadMemberUserIds(threadId);
          for (const uid of memberUserIds) {
            io.to(userRoom(uid)).emit('thread_seen', {
              threadId,
              readerUserId,
              seenMessageIds: markResult.seenMessageIds,
            });
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('thread_activity', async (payload) => {
      try {
        if (!socket.userId) return;
        const threadId = payload?.threadId;
        const kind = payload?.kind;
        const active = Boolean(payload?.active);
        if (typeof threadId !== 'string') return;
        if (kind !== 'typing' && kind !== 'speaking') return;
        const memberUserIds = await chatStore.getThreadMemberUserIds(threadId);
        const me = String(socket.userId);
        if (!memberUserIds.includes(me)) return;
        const eventPayload = {
          threadId,
          kind,
          active,
          fromUserId: me,
          at: Date.now(),
        };
        socket.to(roomName(threadId)).emit('thread_activity', eventPayload);
        for (const uid of memberUserIds) {
          if (uid === me) continue;
          io.to(userRoom(uid)).emit('thread_activity', eventPayload);
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
        // Push an incoming-call alert so callee can answer from other apps/background.
        if (body?.type === 'offer') {
          const sender = await usersStore.findUserById(String(socket.userId));
          const media = body?.media === 'video' ? 'video' : 'audio';
          void pushNotify.notifyIncomingCall(other, {
            callerName: sender?.name || 'Someone',
            threadId,
            media,
            callId,
          });
        }
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
        const members = await chatStore.getThreadMemberUserIds(threadId);
        const norm = normalizeClientSummary(payload?.summary ?? payload?.callSummary, String(socket.userId), members);
        if (norm) {
          const stored = buildStoredText({ ...norm, outcome: 'ended' });
          const msg = await chatStore.addMessage(threadId, stored, String(socket.userId));
          await broadcastNewChatMessage(io, threadId, msg, String(socket.userId), undefined, { skipPush: true });
        }
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
        const members = await chatStore.getThreadMemberUserIds(threadId);
        const norm = normalizeClientSummary(payload?.summary ?? payload?.callSummary, String(socket.userId), members);
        if (norm) {
          const stored = buildStoredText({ ...norm, outcome: 'declined', durationSec: 0 });
          const msg = await chatStore.addMessage(threadId, stored, String(socket.userId));
          await broadcastNewChatMessage(io, threadId, msg, String(socket.userId), undefined, { skipPush: true });
        }
      } catch (e) {
        console.error(e);
      }
    });
  });
}

module.exports = { registerChatSocket };
