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

module.exports = {
  setRealtime,
  notifyThreadsChanged,
  notifyThreadsChangedDebounced,
  emitPresenceChanged,
};
