const MESSAGE_DELIVERY_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  SEEN: 'seen',
};

const MESSAGE_DELIVERY_STATUS_VALUES = Object.values(MESSAGE_DELIVERY_STATUS);

const messageCollectionJsonSchema = {
  bsonType: 'object',
  required: ['threadId', 'iv', 'tag', 'cipher', 'timeLabel', 'outgoing', 'createdAt'],
  additionalProperties: true,
  properties: {
    threadId: { bsonType: 'string', minLength: 1 },
    iv: { bsonType: 'string', minLength: 1 },
    tag: { bsonType: 'string', minLength: 1 },
    cipher: { bsonType: 'string', minLength: 1 },
    cipherDigest: { bsonType: 'string' },
    timeLabel: { bsonType: 'string' },
    outgoing: { bsonType: 'bool' },
    senderUserId: { bsonType: ['string', 'null'] },
    readBy: {
      bsonType: 'array',
      items: { bsonType: 'string' },
    },
    seenByAny: { bsonType: 'bool' },
    deliveryStatus: { enum: MESSAGE_DELIVERY_STATUS_VALUES },
    hiddenForUserIds: {
      bsonType: 'array',
      items: { bsonType: 'string' },
    },
    deletedForEveryone: { bsonType: 'bool' },
    createdAt: { bsonType: 'date' },
  },
};

/**
 * Build canonical message document for insert.
 * @param {object} params
 * @param {string} params.threadId
 * @param {string} params.iv
 * @param {string} params.tag
 * @param {string} params.cipher
 * @param {string} params.cipherDigest
 * @param {string} params.timeLabel
 * @param {boolean} params.outgoing
 * @param {string | null} params.senderUserId
 * @param {string[]} params.readBy
 * @param {boolean} params.seenByAny
 * @param {'sent' | 'delivered' | 'seen'} [params.deliveryStatus]
 * @param {string[]} [params.hiddenForUserIds]
 * @param {boolean} [params.deletedForEveryone]
 * @param {Date} [params.createdAt]
 */
function buildMessageDoc(params) {
  return {
    threadId: String(params.threadId),
    iv: String(params.iv),
    tag: String(params.tag),
    cipher: String(params.cipher),
    cipherDigest: String(params.cipherDigest || ''),
    timeLabel: String(params.timeLabel),
    outgoing: Boolean(params.outgoing),
    senderUserId: params.senderUserId == null ? null : String(params.senderUserId),
    readBy: Array.isArray(params.readBy) ? params.readBy.map((uid) => String(uid)) : [],
    seenByAny: Boolean(params.seenByAny),
    deliveryStatus: MESSAGE_DELIVERY_STATUS_VALUES.includes(params.deliveryStatus)
      ? params.deliveryStatus
      : MESSAGE_DELIVERY_STATUS.SENT,
    hiddenForUserIds: Array.isArray(params.hiddenForUserIds)
      ? params.hiddenForUserIds.map((uid) => String(uid))
      : [],
    deletedForEveryone: Boolean(params.deletedForEveryone),
    createdAt: params.createdAt instanceof Date ? params.createdAt : new Date(),
  };
}

/** Shown in chat when sender deletes a message for everyone (WhatsApp-style). */
const DELETED_FOR_EVERYONE_PLACEHOLDER = 'This message was deleted.';

module.exports = {
  MESSAGE_DELIVERY_STATUS,
  MESSAGE_DELIVERY_STATUS_VALUES,
  messageCollectionJsonSchema,
  buildMessageDoc,
  DELETED_FOR_EVERYONE_PLACEHOLDER,
};
