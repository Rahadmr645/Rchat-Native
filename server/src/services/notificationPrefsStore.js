/** In-memory push mute prefs per user (re-synced from devices on connect / list open). */

/** @type {Map<string, Set<string>>} */
const mutedThreadsByUser = new Map();

/**
 * @param {string} userId
 * @param {string} threadId
 * @param {boolean} muted
 */
function setThreadPushMuted(userId, threadId, muted) {
  const u = String(userId || '');
  const t = String(threadId || '');
  if (!u || !t) return;
  let set = mutedThreadsByUser.get(u);
  if (!set) {
    set = new Set();
    mutedThreadsByUser.set(u, set);
  }
  if (muted) set.add(t);
  else set.delete(t);
  if (set.size === 0) mutedThreadsByUser.delete(u);
}

/**
 * Replace the whole mute set for a user (from device storage sync).
 * @param {string} userId
 * @param {string[]} threadIds
 */
function replaceThreadPushMutes(userId, threadIds) {
  const u = String(userId || '');
  if (!u) return;
  mutedThreadsByUser.delete(u);
  const ids = Array.isArray(threadIds) ? threadIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (ids.length === 0) return;
  mutedThreadsByUser.set(u, new Set(ids));
}

/**
 * @param {string} userId
 * @param {string} threadId
 */
function isThreadPushMuted(userId, threadId) {
  return mutedThreadsByUser.get(String(userId || ''))?.has(String(threadId || '')) ?? false;
}

module.exports = {
  setThreadPushMuted,
  replaceThreadPushMutes,
  isThreadPushMuted,
};
