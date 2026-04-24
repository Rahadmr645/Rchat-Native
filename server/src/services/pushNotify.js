const usersStore = require('./usersStore.js');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * @param {unknown} token
 */
function isLikelyExpoPushToken(token) {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  if (t.length < 24 || t.length > 512) return false;
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken');
}

/**
 * @param {Array<Record<string, unknown>>} messages
 */
async function sendExpoBatch(messages) {
  if (!messages.length) return;
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[push] Expo push HTTP error', res.status, text.slice(0, 500));
  }
}

/**
 * @param {string} userId
 * @param {{ title: string; body: string; data?: Record<string, string> }} payload
 */
async function notifyUser(userId, { title, body, data }) {
  try {
    const tokens = (await usersStore.getExpoPushTokens(userId)).filter(isLikelyExpoPushToken);
    if (!tokens.length) return;
    const dataFlat = {};
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') dataFlat[k] = v;
      }
    }
    const messages = tokens.map((to) => ({
      to,
      title: String(title || 'RChat').slice(0, 120),
      body: String(body || '').slice(0, 400),
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      data: dataFlat,
    }));
    await sendExpoBatch(messages);
  } catch (e) {
    console.error('[push] notifyUser failed', e);
  }
}

/**
 * @param {string} toUserId
 * @param {string} fromName
 */
function notifyFriendRequest(toUserId, fromName) {
  const name = String(fromName || 'Someone').trim() || 'Someone';
  return notifyUser(toUserId, {
    title: 'Friend request',
    body: `${name} sent you a friend request`,
    data: { type: 'friend_request' },
  });
}

/**
 * @param {string} toUserId
 * @param {string} senderName
 * @param {string} textPreview
 * @param {string} threadId
 */
function notifyChatMessage(toUserId, senderName, textPreview, threadId) {
  const name = String(senderName || 'Someone').trim() || 'Someone';
  const preview = String(textPreview || '').trim().slice(0, 160);
  return notifyUser(toUserId, {
    title: name,
    body: preview || 'New message',
    data: { type: 'chat_message', threadId: String(threadId || '') },
  });
}

module.exports = {
  notifyFriendRequest,
  notifyChatMessage,
};
