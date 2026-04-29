const crypto = require('crypto');
const { THREAD_META, MESSAGES_SEED } = require('../seed/seed.js');
const { encryptText, decryptText } = require('../lib/cryptoMessage.js');
const presenceStore = require('./presenceStore.js');

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
      await messagesCol().insertOne({
        threadId,
        iv,
        tag,
        cipher,
        cipherDigest: digestCipherFields(iv, tag, cipher),
        timeLabel: m.timeLabel,
        outgoing: m.outgoing,
        createdAt: new Date(base + i * 1000),
      });
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
        const text = decryptRow(last);
        const fromMe =
          last.senderUserId != null && viewerUserId
            ? last.senderUserId === viewerUserId
            : Boolean(last.outgoing);
        lastMessage = fromMe ? `You: ${text}` : text;
        timeLabel = last.timeLabel;
      }
      let lastSeen = '';
      if (other?.userId) {
        lastSeen = await presenceStore.getSubtitleForUserId(other.userId);
      }
      out.push({
        id,
        name: displayName,
        avatarLetter: letter,
        avatarUrl,
        lastMessage,
        timeLabel,
        lastSeen,
      });
      continue;
    }
    const last = await messagesCol().find({ threadId: id }).sort({ createdAt: -1 }).limit(1).next();
    let lastMessage = '';
    let timeLabel = '';
    if (last) {
      const text = decryptRow(last);
      lastMessage = last.outgoing ? `You: ${text}` : text;
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
 * @param {string} threadId
 * @param {string | undefined} viewerUserId
 */
async function getMessages(threadId, viewerUserId) {
  const exists = await threadsCol().findOne({ _id: threadId });
  if (!exists) return [];
  if (Array.isArray(exists.members) && exists.members.length > 0) {
    if (!viewerUserId || !exists.members.some((m) => m.userId === viewerUserId)) return [];
  }
  const rows = await messagesCol().find({ threadId }).sort({ createdAt: 1 }).toArray();
  return rows.map((r) => {
    let outgoing = r.outgoing;
    if (r.senderUserId != null && viewerUserId) {
      outgoing = r.senderUserId === viewerUserId;
    }
    return {
      id: r._id.toString(),
      text: decryptRow(r),
      timeLabel: r.timeLabel,
      outgoing,
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
    if (!senderUserId || !exists.members.some((m) => m.userId === senderUserId)) return null;
  }
  const body = String(text).slice(0, 4000);
  const { iv, tag, cipher } = encryptText(body);
  const timeLabel = nowTimeLabel();
  const ins = await messagesCol().insertOne({
    threadId,
    iv,
    tag,
    cipher,
    cipherDigest: digestCipherFields(iv, tag, cipher),
    timeLabel,
    outgoing: true,
    senderUserId: senderUserId || null,
    createdAt: new Date(),
  });
  return {
    id: ins.insertedId.toString(),
    text: body,
    timeLabel,
    outgoing: true,
    senderUserId: senderUserId || null,
  };
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
  getMessages,
  addMessage,
  upsertDmThread,
  updateMemberAvatarInAllDmThreads,
  getThreadPresenceForViewer,
  getOtherDmMemberUserId,
};
