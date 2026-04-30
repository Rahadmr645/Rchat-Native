const crypto = require('crypto');
const { THREAD_META, MESSAGES_SEED } = require('../seed/seed.js');
const { encryptText, decryptText } = require('../lib/cryptoMessage.js');
const presenceStore = require('./presenceStore.js');
const {
  MESSAGE_DELIVERY_STATUS,
  messageCollectionJsonSchema,
  buildMessageDoc,
  DELETED_FOR_EVERYONE_PLACEHOLDER,
} = require('../models/message.model.js');
const { formatLineForViewer } = require('../lib/callLogMessage.js');

/** SHA-256 of stored ciphertext fields (integrity / indexing; not the plaintext). */
function digestCipherFields(iv, tag, cipher) {
  return crypto.createHash('sha256').update(`${iv}|${tag}|${cipher}`).digest('hex');
}

/** @type {import('mongodb').Db | null} */
let db = null;

function threadsCol() {
  return db.collection('threads');
}

function messagesCol() {
  return db.collection('messages');
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function nowTimeLabel() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function decryptRow(row) {
  if (row?.cipher && row?.iv && row?.tag) {
    try {
      return decryptText({ iv: row.iv, tag: row.tag, cipher: row.cipher });
    } catch {
      return '[Unable to decrypt — check MESSAGE_CIPHER_KEY matches the key used when saving]';
    }
  }
  if (typeof row?.text === 'string') {
    return row.text;
  }
  return '[Invalid message record]';
}

/** Plaintext shown to all participants when a message is revoked (delete for everyone). */
function displayTextForStoredMessage(row) {
  if (row?.deletedForEveryone === true) return DELETED_FOR_EVERYONE_PLACEHOLDER;
  return decryptRow(row);
}

function normalizeStatus(status) {
  return status === 'seen' || status === 'delivered' || status === 'sent'
    ? status
    : MESSAGE_DELIVERY_STATUS.SENT;
}

function avatarLetterFromName(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  return s[0].toUpperCase();
}

/**
 * @param {string} userIdA
 * @param {string} userIdB
 */
function dmThreadId(userIdA, userIdB) {
  const [x, y] = [String(userIdA), String(userIdB)].sort();
  return `dm:${x}:${y}`;
}

/**
 * @param {string} userIdA
 * @param {string} userIdB
 * @param {{ name: string; avatarUrl?: string | null }} profileA
 * @param {{ name: string; avatarUrl?: string | null }} profileB
 */
async function upsertDmThread(userIdA, userIdB, profileA, profileB) {
  const id = dmThreadId(userIdA, userIdB);
  const urlA =
    typeof profileA.avatarUrl === 'string' && profileA.avatarUrl.trim() ? profileA.avatarUrl.trim() : null;
  const urlB =
    typeof profileB.avatarUrl === 'string' && profileB.avatarUrl.trim() ? profileB.avatarUrl.trim() : null;
  const doc = {
    _id: id,
    kind: 'dm',
    members: [
      {
        userId: String(userIdA),
        name: profileA.name,
        avatarLetter: avatarLetterFromName(profileA.name),
        avatarUrl: urlA,
      },
      {
        userId: String(userIdB),
        name: profileB.name,
        avatarLetter: avatarLetterFromName(profileB.name),
        avatarUrl: urlB,
      },
    ],
  };
  await threadsCol().replaceOne({ _id: id }, doc, { upsert: true });
  return id;
}

/**
 * @param {string} userId
 * @param {string | null} avatarUrl
 */
async function updateMemberAvatarInAllDmThreads(userId, avatarUrl) {
  const uid = String(userId);
  const url =
    avatarUrl == null || avatarUrl === ''
      ? null
      : String(avatarUrl).trim().slice(0, 2048);
  const threads = await threadsCol().find({ 'members.userId': uid }).toArray();
  for (const doc of threads) {
    if (!Array.isArray(doc.members)) continue;
    const members = doc.members.map((m) =>
      String(m.userId) === uid ? { ...m, avatarUrl: url } : m,
    );
    await threadsCol().updateOne({ _id: doc._id }, { $set: { members } });
  }
}

/**
 * @param {import('mongodb').Db} database
 */
async function init(database) {
  db = database;
  try {
    await db.command({
      collMod: 'messages',
      validator: { $jsonSchema: messageCollectionJsonSchema },
      validationLevel: 'moderate',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || '');
    if (!/ns does not exist/i.test(msg)) throw e;
    await db.createCollection('messages', {
      validator: { $jsonSchema: messageCollectionJsonSchema },
      validationLevel: 'moderate',
    });
  }
  await messagesCol().createIndex({ threadId: 1, createdAt: 1 });

  const threadCount = await threadsCol().estimatedDocumentCount();
  if (threadCount === 0 && THREAD_META.length > 0) {
    await threadsCol().insertMany(
      THREAD_META.map((t) => ({
        _id: t.id,
        name: t.name,
        avatarLetter: t.avatarLetter,
        lastSeen: t.lastSeen,
      })),
    );
  }

  for (const threadId of Object.keys(MESSAGES_SEED)) {
    const list = MESSAGES_SEED[threadId];
    if (!list || list.length === 0) continue;
    const existing = await messagesCol().countDocuments({ threadId });
    if (existing > 0) continue;
    const base = Date.now();
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const { iv, tag, cipher } = encryptText(m.text);
      await messagesCol().insertOne(
        buildMessageDoc({
          threadId,
          iv,
          tag,
          cipher,
          cipherDigest: digestCipherFields(iv, tag, cipher),
          timeLabel: m.timeLabel,
          outgoing: m.outgoing,
          senderUserId: null,
          readBy: [],
          seenByAny: false,
          deliveryStatus: MESSAGE_DELIVERY_STATUS.SENT,
          createdAt: new Date(base + i * 1000),
        }),
      );
    }
  }
}

/**
 * @param {string} viewerUserId
 */
async function getThreads(viewerUserId) {
  const threads = await threadsCol().find().sort({ _id: 1 }).toArray();
  const out = [];
  for (const t of threads) {
    const id = String(t._id);
    if (Array.isArray(t.members) && t.members.length > 0) {
      if (!viewerUserId || !t.members.some((m) => m.userId === viewerUserId)) continue;
      const other = t.members.find((m) => m.userId !== viewerUserId);
      const displayName = other?.name ?? t.name ?? 'Chat';
      const letter = other?.avatarLetter ?? avatarLetterFromName(displayName);
      const avatarUrl =
        typeof other?.avatarUrl === 'string' && other.avatarUrl.trim() ? other.avatarUrl.trim() : undefined;
      const last = await messagesCol().find({ threadId: id }).sort({ createdAt: -1 }).limit(1).next();
      let lastMessage = '';
      let timeLabel = '';
      if (last) {
        const text = displayTextForStoredMessage(last);
        const fromMe =
          last.senderUserId != null && viewerUserId
            ? last.senderUserId === viewerUserId
            : Boolean(last.outgoing);
        const callLine = viewerUserId ? formatLineForViewer(viewerUserId, text) : null;
        lastMessage =
          callLine != null ? callLine : fromMe ? `You: ${text}` : text;
        timeLabel = last.timeLabel;
      }
      let lastSeen = '';
      if (other?.userId) {
        lastSeen = await presenceStore.getSubtitleForUserId(other.userId);
      }
      const unreadCount = viewerUserId
        ? await messagesCol().countDocuments({
            threadId: id,
            $and: [
              { $or: [{ senderUserId: { $exists: false } }, { senderUserId: { $ne: viewerUserId } }] },
              { $or: [{ readBy: { $exists: false } }, { readBy: { $nin: [viewerUserId] } }] },
            ],
          })
        : 0;
      out.push({
        id,
        name: displayName,
        avatarLetter: letter,
        avatarUrl,
        lastMessage,
        timeLabel,
        lastSeen,
        unreadCount: unreadCount > 0 ? unreadCount : undefined,
      });
      continue;
    }
    const last = await messagesCol().find({ threadId: id }).sort({ createdAt: -1 }).limit(1).next();
    let lastMessage = '';
    let timeLabel = '';
    if (last) {
      const text = displayTextForStoredMessage(last);
      const callLine = viewerUserId ? formatLineForViewer(viewerUserId, text) : null;
      if (callLine != null) {
        lastMessage = callLine;
      } else {
        const fromMe =
          last.senderUserId != null && viewerUserId
            ? last.senderUserId === viewerUserId
            : Boolean(last.outgoing);
        lastMessage = fromMe ? `You: ${text}` : text;
      }
      timeLabel = last.timeLabel;
    }
    out.push({
      id,
      name: t.name,
      avatarLetter: t.avatarLetter,
      lastMessage,
      timeLabel,
      lastSeen: t.lastSeen,
    });
  }
  return out;
}

/**
 * Total unread incoming messages across all threads the user belongs to (for app icon badge).
 * @param {string} viewerUserId
 */
async function getTotalUnreadCountForUser(viewerUserId) {
  if (!viewerUserId) return 0;
  const vid = String(viewerUserId);
  const threads = await threadsCol()
    .find({ 'members.userId': vid })
    .project({ _id: 1 })
    .toArray();
  let total = 0;
  for (const t of threads) {
    const id = String(t._id);
    total += await messagesCol().countDocuments({
      threadId: id,
      $and: [
        { $or: [{ senderUserId: { $exists: false } }, { senderUserId: { $ne: vid } }] },
        { $or: [{ readBy: { $exists: false } }, { readBy: { $nin: [vid] } }] },
      ],
    });
  }
  return total;
}

/**
 * @param {string} threadId
 * @param {string | undefined} viewerUserId
 */
async function getMessages(threadId, viewerUserId) {
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists) return [];
  if (Array.isArray(exists.members) && exists.members.length > 0) {
    const vid = viewerUserId == null ? '' : String(viewerUserId);
    if (!vid || !exists.members.some((m) => String(m.userId) === vid)) return [];
  }
  if (viewerUserId) {
    await markThreadRead(threadId, viewerUserId);
  }
  const tid = String(threadId);
  const rows = await messagesCol().find({ threadId: tid }).sort({ createdAt: 1 }).toArray();
  const visibleRows = rows.filter((r) => {
    const hidden = Array.isArray(r.hiddenForUserIds) ? r.hiddenForUserIds : [];
    if (viewerUserId && hidden.some((h) => String(h) === String(viewerUserId))) return false;
    return true;
  });
  return visibleRows.map((r) => {
    let outgoing = r.outgoing;
    if (r.senderUserId != null && viewerUserId) {
      outgoing = r.senderUserId === viewerUserId;
    }
    const seenByOther =
      Boolean(viewerUserId) &&
      outgoing &&
      (Boolean(r.seenByAny) ||
        (Array.isArray(r.readBy) && r.readBy.some((uid) => String(uid) !== String(viewerUserId))));
    const deliveryStatus = outgoing
      ? seenByOther
        ? MESSAGE_DELIVERY_STATUS.SEEN
        : normalizeStatus(r.deliveryStatus)
      : MESSAGE_DELIVERY_STATUS.SEEN;
    const isDeletedForEveryone = Boolean(r.deletedForEveryone);
    return {
      id: r._id.toString(),
      text: displayTextForStoredMessage(r),
      timeLabel: r.timeLabel,
      outgoing,
      seenByOther,
      deliveryStatus,
      isDeletedForEveryone,
    };
  });
}

/**
 * @param {string} threadId
 * @param {string} text
 * @param {string | undefined} senderUserId
 */
async function addMessage(threadId, text, senderUserId) {
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists) return null;
  if (Array.isArray(exists.members) && exists.members.length > 0) {
    const sid = senderUserId == null ? '' : String(senderUserId);
    if (!sid || !exists.members.some((m) => String(m.userId) === sid)) return null;
  }
  const body = String(text).slice(0, 4000);
  const { iv, tag, cipher } = encryptText(body);
  const timeLabel = nowTimeLabel();
  const ins = await messagesCol().insertOne(
    buildMessageDoc({
      threadId,
      iv,
      tag,
      cipher,
      cipherDigest: digestCipherFields(iv, tag, cipher),
      timeLabel,
      outgoing: true,
      senderUserId: senderUserId || null,
      readBy: senderUserId ? [String(senderUserId)] : [],
      seenByAny: false,
      deliveryStatus: MESSAGE_DELIVERY_STATUS.SENT,
      createdAt: new Date(),
    }),
  );
  return {
    id: ins.insertedId.toString(),
    text: body,
    timeLabel,
    outgoing: true,
    senderUserId: senderUserId || null,
    seenByOther: false,
    deliveryStatus: MESSAGE_DELIVERY_STATUS.SENT,
  };
}

/**
 * @param {string} threadId
 * @param {string | undefined} viewerUserId
 * @returns {Promise<{ changed: boolean; seenMessageIds: string[] }>}
 */
async function markThreadRead(threadId, viewerUserId) {
  if (!viewerUserId) return { changed: false, seenMessageIds: [] };
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists) return { changed: false, seenMessageIds: [] };
  const vid = String(viewerUserId);
  if (Array.isArray(exists.members) && exists.members.length > 0) {
    if (!exists.members.some((m) => String(m.userId) === vid)) {
      return { changed: false, seenMessageIds: [] };
    }
  }
  const tid = String(threadId);
  const unreadRows = await messagesCol()
    .find(
      {
        threadId: tid,
        $and: [
          { $or: [{ senderUserId: { $exists: false } }, { senderUserId: { $ne: vid } }] },
          { $or: [{ readBy: { $exists: false } }, { readBy: { $nin: [vid] } }] },
        ],
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  if (unreadRows.length === 0) return { changed: false, seenMessageIds: [] };
  const unreadObjectIds = unreadRows.map((r) => r._id);
  const seenMessageIds = unreadRows.map((r) => r._id.toString());
  const result = await messagesCol().updateMany(
    {
      _id: { $in: unreadObjectIds },
    },
    { $addToSet: { readBy: vid } },
  );
  if (result.modifiedCount > 0) {
    await messagesCol().updateMany(
      {
        _id: { $in: unreadObjectIds },
        senderUserId: { $exists: true, $ne: vid },
      },
      { $set: { seenByAny: true, deliveryStatus: MESSAGE_DELIVERY_STATUS.SEEN } },
    );
  }
  return { changed: result.modifiedCount > 0, seenMessageIds: result.modifiedCount > 0 ? seenMessageIds : [] };
}

/**
 * @param {string} messageId
 * @param {string[]} receiverUserIds
 * @returns {Promise<boolean>}
 */
async function markMessageDelivered(messageId, receiverUserIds) {
  const ids = Array.isArray(receiverUserIds)
    ? receiverUserIds.map((uid) => String(uid)).filter((uid) => uid.length > 0)
    : [];
  if (ids.length === 0) return false;
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(messageId)) return false;
  const result = await messagesCol().updateOne(
    {
      _id: new ObjectId(messageId),
      senderUserId: { $nin: ids },
      deliveryStatus: { $ne: MESSAGE_DELIVERY_STATUS.SEEN },
    },
    { $set: { deliveryStatus: MESSAGE_DELIVERY_STATUS.DELIVERED } },
  );
  return result.modifiedCount > 0;
}

/**
 * Find every message that was sent to `viewerUserId` while they were offline
 * and bump its deliveryStatus from 'sent' to 'delivered'. Used when the user
 * reconnects so the sender's UI can flip from a single tick to a double tick
 * (IMO/WhatsApp style).
 *
 * @param {string} viewerUserId
 * @returns {Promise<{ threadId: string; messageIds: string[] }[]>}
 */
async function markPendingMessagesDeliveredForUser(viewerUserId) {
  if (!viewerUserId) return [];
  const uid = String(viewerUserId);
  const threads = await threadsCol()
    .find({ 'members.userId': uid }, { projection: { _id: 1 } })
    .toArray();
  if (threads.length === 0) return [];
  const threadIds = threads.map((t) => String(t._id));
  const pending = await messagesCol()
    .find(
      {
        threadId: { $in: threadIds },
        senderUserId: { $exists: true, $ne: uid },
        deliveryStatus: MESSAGE_DELIVERY_STATUS.SENT,
      },
      { projection: { _id: 1, threadId: 1 } },
    )
    .toArray();
  if (pending.length === 0) return [];
  const objectIds = pending.map((r) => r._id);
  const result = await messagesCol().updateMany(
    {
      _id: { $in: objectIds },
      deliveryStatus: MESSAGE_DELIVERY_STATUS.SENT,
    },
    { $set: { deliveryStatus: MESSAGE_DELIVERY_STATUS.DELIVERED } },
  );
  if (result.modifiedCount === 0) return [];
  const grouped = new Map();
  for (const row of pending) {
    const tid = String(row.threadId);
    const list = grouped.get(tid) ?? [];
    list.push(row._id.toString());
    grouped.set(tid, list);
  }
  return Array.from(grouped.entries()).map(([threadId, messageIds]) => ({
    threadId,
    messageIds,
  }));
}

/**
 * @param {string} threadId
 * @param {string} viewerUserId
 */
/**
 * @param {string} threadId
 * @param {string} viewerUserId
 * @returns {Promise<string | null>}
 */
async function getOtherDmMemberUserId(threadId, viewerUserId) {
  if (!viewerUserId) return null;
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists || !Array.isArray(exists.members) || exists.members.length === 0) return null;
  if (!exists.members.some((m) => m.userId === viewerUserId)) return null;
  const other = exists.members.find((m) => m.userId !== viewerUserId);
  return other?.userId ? String(other.userId) : null;
}

/**
 * @param {string} threadId
 * @returns {Promise<string[]>}
 */
async function getThreadMemberUserIds(threadId) {
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists || !Array.isArray(exists.members) || exists.members.length === 0) return [];
  return exists.members
    .map((m) => (m?.userId ? String(m.userId) : ''))
    .filter((uid) => uid.length > 0);
}

/**
 * @param {string} threadId
 * @param {string | undefined} viewerUserId
 * @param {string[]} messageIds
 * @param {'me' | 'everyone'} scope
 * @returns {Promise<{ ok: boolean; error?: string; affectedIds?: string[]; scope?: string; deletedCount?: number }>}
 */
async function deleteMessages(threadId, viewerUserId, messageIds, scope) {
  const uid = viewerUserId == null ? '' : String(viewerUserId);
  const ids = Array.isArray(messageIds)
    ? messageIds.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : [];
  if (!uid || ids.length === 0) return { ok: false, error: 'bad_request' };
  if (scope !== 'me' && scope !== 'everyone') return { ok: false, error: 'bad_request' };

  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists) return { ok: false, error: 'not_found' };
  if (Array.isArray(exists.members) && exists.members.length > 0) {
    if (!exists.members.some((m) => String(m.userId) === uid)) {
      return { ok: false, error: 'forbidden' };
    }
  }

  const { ObjectId } = require('mongodb');
  const oids = [];
  const validIds = [];
  for (const id of ids) {
    if (ObjectId.isValid(id)) {
      oids.push(new ObjectId(id));
      validIds.push(id);
    }
  }
  if (oids.length === 0) return { ok: true, affectedIds: [], scope };

  const tid = String(threadId);

  if (scope === 'me') {
    await messagesCol().updateMany({ _id: { $in: oids }, threadId: tid }, { $addToSet: { hiddenForUserIds: uid } });
    return { ok: true, affectedIds: validIds, scope: 'me' };
  }

  const revokeCandidates = await messagesCol()
    .find({
      _id: { $in: oids },
      threadId: tid,
      deletedForEveryone: { $ne: true },
    })
    .project({ _id: 1, senderUserId: 1 })
    .toArray();
  const toDelete = revokeCandidates.filter((row) => String(row.senderUserId ?? '') === uid);
  if (toDelete.length === 0) {
    return { ok: true, affectedIds: [], scope: 'everyone', deletedCount: 0 };
  }
  const deleteOids = toDelete.map((d) => d._id);
  const updResult = await messagesCol().updateMany(
    { _id: { $in: deleteOids }, threadId: tid },
    { $set: { deletedForEveryone: true } },
  );
  return {
    ok: true,
    affectedIds: toDelete.map((d) => d._id.toString()),
    scope: 'everyone',
    deletedCount: updResult.modifiedCount,
  };
}

async function getThreadPresenceForViewer(threadId, viewerUserId) {
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists || !Array.isArray(exists.members) || exists.members.length === 0) {
    return { subtitle: '', otherUserId: null };
  }
  if (!viewerUserId || !exists.members.some((m) => m.userId === viewerUserId)) {
    return { subtitle: '', otherUserId: null };
  }
  const other = exists.members.find((m) => m.userId !== viewerUserId);
  if (!other?.userId) {
    return { subtitle: '', otherUserId: null };
  }
  const subtitle = await presenceStore.getSubtitleForUserId(other.userId);
  return { subtitle, otherUserId: other.userId };
}

module.exports = {
  init,
  getThreads,
  getTotalUnreadCountForUser,
  getMessages,
  addMessage,
  upsertDmThread,
  updateMemberAvatarInAllDmThreads,
  getThreadPresenceForViewer,
  getOtherDmMemberUserId,
  getThreadMemberUserIds,
  markThreadRead,
  markMessageDelivered,
  markPendingMessagesDeliveredForUser,
  deleteMessages,
};
