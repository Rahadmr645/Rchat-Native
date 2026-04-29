/** @type {import('socket.io').Server | null} */
let io = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let threadsDebounceTimer = null;

/**
 * @param {import('socket.io').Server} ioInstance
 */
function setRealtime(ioInstance) {
  io = ioInstance;
}

function notifyThreadsChanged() {
  if (io) io.emit('threads_changed');
}

/**
 * @param {number} [delayMs]
 */
function notifyThreadsChangedDebounced(delayMs = 450) {
  if (!io) return;
  if (threadsDebounceTimer) clearTimeout(threadsDebounceTimer);
  threadsDebounceTimer = setTimeout(() => {
    threadsDebounceTimer = null;
    io.emit('threads_changed');
  }, delayMs);
}

/**
 * @param {string} userId
 */
function emitPresenceChanged(userId) {
  if (io && userId) io.emit('presence_changed', { userId: String(userId) });
}

/**
 * @param {string} threadId
 * @param {string[]} memberUserIds
 * @param {{ threadId: string; messageIds: string[]; scope: 'me' | 'everyone' }} payload
 */
function emitThreadMessagesDeleted(threadId, memberUserIds, payload) {
  if (!io) return;
  const room = `thread:${threadId}`;
  io.to(room).emit('thread_messages_deleted', payload);
  const ids = Array.isArray(memberUserIds) ? memberUserIds : [];
  for (const uid of ids) {
    if (uid) io.to(`user:${uid}`).emit('thread_messages_deleted', payload);
  }
}

module.exports = {
  setRealtime,
  notifyThreadsChanged,
  notifyThreadsChangedDebounced,
  emitPresenceChanged,
  emitThreadMessagesDeleted,
};
