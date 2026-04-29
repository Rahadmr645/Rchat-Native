const crypto = require('crypto');
const usersStore = require('./usersStore.js');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const VOICE_PREFIX = '🎤RCHAT_B64:';
const PHOTO_PREFIX = '📷RCHAT_B64:';

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
 * Human-readable preview for encrypted/plain chat payloads (matches in-app labels).
 * @param {string} rawText
 */
function pushBodyPreview(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return 'New message';
  if (text.startsWith(VOICE_PREFIX)) return 'Voice message';
  if (text.startsWith(PHOTO_PREFIX)) {
    try {
      const b64 = text.slice(PHOTO_PREFIX.length).trim();
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const o = JSON.parse(json);
      const cap = typeof o?.t === 'string' ? o.t.trim() : '';
      return cap || 'Photo';
    } catch {
      return 'Photo';
    }
  }
  if (text.startsWith('RCHAT_REPLY|')) return 'Reply';
  const single = text.replace(/\s+/g, ' ');
  return single.length > 160 ? `${single.slice(0, 157)}...` : single;
}

/**
 * Stable short Android notification tag (per thread) so new messages replace the same heads-up.
 * @param {string} threadId
 */
function androidTagForThread(threadId) {
  const h = crypto.createHash('sha256').update(String(threadId)).digest('hex').slice(0, 24);
  return `rchat_${h}`;
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
 * @param {{
 *   title: string;
 *   body: string;
 *   data?: Record<string, string>;
 *   channelId?: string;
 *   badge?: number;
 *   tag?: string;
 *   threadIdentifier?: string;
 *   subtitle?: string;
 * }} payload
 */
async function notifyUser(userId, { title, body, data, channelId, badge, tag, threadIdentifier, subtitle }) {
  try {
    const tokens = (await usersStore.getExpoPushTokens(userId)).filter(isLikelyExpoPushToken);
    if (!tokens.length) return;
    const dataFlat = {};
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') dataFlat[k] = v;
      }
    }
    const messages = tokens.map((to) => {
      /** @type {Record<string, unknown>} */
      const msg = {
        to,
        title: String(title || 'RChat').slice(0, 120),
        body: String(body || '').slice(0, 400),
        sound: 'default',
        priority: 'high',
        channelId: channelId || 'default',
        data: dataFlat,
      };
      if (typeof badge === 'number' && Number.isFinite(badge) && badge >= 0) {
        msg.badge = Math.min(Math.floor(badge), 99999);
      }
      if (typeof tag === 'string' && tag.length > 0) {
        msg.tag = tag.slice(0, 64);
      }
      if (typeof threadIdentifier === 'string' && threadIdentifier.length > 0) {
        msg.threadIdentifier = threadIdentifier.slice(0, 128);
      }
      if (typeof subtitle === 'string' && subtitle.length > 0) {
        msg.subtitle = subtitle.slice(0, 120);
      }
      return msg;
    });
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
    channelId: 'default',
  });
}

/**
 * @param {string} toUserId
 * @param {string} senderName
 * @param {string} textPreview
 * @param {string} threadId
 * @param {{ messageId?: string; badge?: number }} [opts]
 */
function notifyChatMessage(toUserId, senderName, textPreview, threadId, opts = {}) {
  const name = String(senderName || 'Someone').trim() || 'Someone';
  const preview = pushBodyPreview(textPreview);
  const tid = String(threadId || '');
  const data = {
    type: 'chat_message',
    threadId: tid,
  };
  if (opts.messageId) data.messageId = String(opts.messageId);
  return notifyUser(toUserId, {
    title: name,
    body: preview,
    subtitle: 'Message',
    data,
    channelId: 'messages',
    badge: typeof opts.badge === 'number' ? opts.badge : undefined,
    tag: tid ? androidTagForThread(tid) : undefined,
    threadIdentifier: tid || undefined,
  });
}

/**
 * @param {string} toUserId
 * @param {{ callerName: string; threadId: string; media: 'audio' | 'video'; callId: string }} payload
 */
function notifyIncomingCall(toUserId, payload) {
  const callerName = String(payload?.callerName || 'Someone').trim() || 'Someone';
  const media = payload?.media === 'video' ? 'video' : 'audio';
  const threadId = String(payload?.threadId || '').trim();
  const callId = String(payload?.callId || '').trim();
  if (!threadId || !callId) return Promise.resolve();
  return notifyUser(toUserId, {
    title: callerName,
    body: media === 'video' ? 'Incoming video call' : 'Incoming voice call',
    channelId: 'calls',
    data: {
      type: 'incoming_call',
      threadId,
      media,
      callId,
      callerName,
    },
  });
}

module.exports = {
  notifyFriendRequest,
  notifyChatMessage,
  notifyIncomingCall,
};
