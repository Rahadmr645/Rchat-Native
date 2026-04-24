const usersStore = require('./usersStore.js');
const {
  notifyThreadsChangedDebounced,
  emitPresenceChanged,
} = require('../socket/realtime.js');

/** @type {Map<string, Set<string>>} */
const socketIdsByUser = new Map();

/**
 * @param {string} userId
 * @param {string} socketId
 */
function handleSocketConnected(userId, socketId) {
  if (!userId || !socketId) return;
  let set = socketIdsByUser.get(userId);
  if (!set) {
    set = new Set();
    socketIdsByUser.set(userId, set);
  }
  const wasOffline = set.size === 0;
  set.add(socketId);
  if (wasOffline) {
    emitPresenceChanged(userId);
    notifyThreadsChangedDebounced();
  }
}

/**
 * @param {string} userId
 * @param {string} socketId
 */
async function handleSocketDisconnected(userId, socketId) {
  if (!userId || !socketId) return;
  const set = socketIdsByUser.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    socketIdsByUser.delete(userId);
    await usersStore.setLastSeenAt(userId, new Date());
    emitPresenceChanged(userId);
    notifyThreadsChangedDebounced();
  }
}

/**
 * @param {string} userId
 */
function isUserOnline(userId) {
  const set = socketIdsByUser.get(userId);
  return Boolean(set && set.size > 0);
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * @param {Date} d
 */
function formatClock(d) {
  let h = d.getHours();
  const m = pad2(d.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * @param {Date | string | number} at
 */
function formatLastSeenPhrase(at) {
  const d = at instanceof Date ? at : new Date(at);
  const now = new Date();
  if (Number.isNaN(d.getTime())) return 'recently';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const d0 = startOf(d);
  const n0 = startOf(now);
  const diffDays = Math.round((n0.getTime() - d0.getTime()) / 86400000);
  const clk = formatClock(d);
  if (diffDays === 0) return `today at ${clk}`;
  if (diffDays === 1) return `yesterday at ${clk}`;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (diffDays > 1 && diffDays < 7) return `${dayNames[d.getDay()]} at ${clk}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${datePart} at ${clk}`;
}

/**
 * @param {string} userId
 */
async function getSubtitleForUserId(userId) {
  if (!userId) return '';
  if (isUserOnline(userId)) return 'online';
  const u = await usersStore.findUserById(userId);
  const raw = u?.lastSeenAt;
  if (!raw) return 'last seen recently';
  const d = raw instanceof Date ? raw : new Date(raw);
  return `last seen ${formatLastSeenPhrase(d)}`;
}

module.exports = {
  handleSocketConnected,
  handleSocketDisconnected,
  isUserOnline,
  getSubtitleForUserId,
};
