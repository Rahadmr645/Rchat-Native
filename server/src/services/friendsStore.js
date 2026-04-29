const { ObjectId } = require('mongodb');
const usersStore = require('./usersStore.js');
const chatStore = require('./chatStore.js');

/** @type {import('mongodb').Db | null} */
let db = null;

function requestsCol() {
  return db.collection('friend_requests');
}

function friendshipsCol() {
  return db.collection('friendships');
}

function sortedPairKey(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `${x}:${y}`;
}

/**
 * @param {import('mongodb').Db} database
 */
async function init(database) {
  db = database;
  await requestsCol().createIndex({ toUserId: 1, status: 1 });
  await requestsCol().createIndex({ fromUserId: 1, toUserId: 1 });
  await friendshipsCol().createIndex({ pairKey: 1 }, { unique: true });
}

/**
 * @param {string} a
 * @param {string} b
 */
async function areFriends(a, b) {
  const row = await friendshipsCol().findOne({ pairKey: sortedPairKey(a, b) });
  return Boolean(row);
}

/**
 * @param {string} a
 * @param {string} b
 */
async function addFriendship(a, b) {
  await friendshipsCol().updateOne(
    { pairKey: sortedPairKey(a, b) },
    { $setOnInsert: { pairKey: sortedPairKey(a, b), createdAt: new Date() } },
    { upsert: true },
  );
}

/**
 * @param {string} fromUserId
 * @param {string} email
 * @returns {Promise<{ ok: true } | { ok: false; code: string; message?: string }>}
 */
async function createFriendRequest(fromUserId, email) {
  const norm = usersStore.normalizeEmail(email);
  if (!norm) {
    return { ok: false, code: 'email_required', message: 'Enter an email address.' };
  }
  if (!usersStore.isValidEmail(norm)) {
    return { ok: false, code: 'invalid_email', message: 'Enter a valid email address.' };
  }
  const target = await usersStore.findUserByEmail(norm);
  if (!target) {
    return { ok: false, code: 'user_not_found', message: 'No account uses that email.' };
  }
  const toUserId = target._id.toString();
  if (toUserId === fromUserId) {
    return { ok: false, code: 'cannot_add_self', message: 'You cannot send a friend request to yourself.' };
  }
  if (await areFriends(fromUserId, toUserId)) {
    return { ok: false, code: 'already_friends', message: 'You are already friends with this person.' };
  }
  const dupPending = await requestsCol().findOne({
    fromUserId,
    toUserId,
    status: 'pending',
  });
  if (dupPending) {
    return { ok: false, code: 'request_pending', message: 'A friend request is already waiting for them.' };
  }
  const reverse = await requestsCol().findOne({
    fromUserId: toUserId,
    toUserId: fromUserId,
    status: 'pending',
  });
  if (reverse) {
    return {
      ok: false,
      code: 'reverse_pending',
      message: 'They already sent you a request. Accept it from Incoming below.',
    };
  }
  await requestsCol().insertOne({
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date(),
  });
  return { ok: true, toUserId };
}

/**
 * @param {string} userId
 */
async function listRequestsForUser(userId) {
  const incomingRows = await requestsCol()
    .find({ toUserId: userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .toArray();
  const outgoingRows = await requestsCol()
    .find({ fromUserId: userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .toArray();

  const incoming = [];
  for (const r of incomingRows) {
    const u = await usersStore.findUserById(r.fromUserId);
    if (!u) continue;
    incoming.push({
      id: r._id.toString(),
      createdAt: r.createdAt.toISOString(),
      from: {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        avatarUrl:
          typeof u.avatarUrl === 'string' && u.avatarUrl.trim() ? u.avatarUrl.trim() : null,
      },
    });
  }
  const outgoing = [];
  for (const r of outgoingRows) {
    const u = await usersStore.findUserById(r.toUserId);
    if (!u) continue;
    outgoing.push({
      id: r._id.toString(),
      createdAt: r.createdAt.toISOString(),
      to: {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        avatarUrl:
          typeof u.avatarUrl === 'string' && u.avatarUrl.trim() ? u.avatarUrl.trim() : null,
      },
    });
  }
  return { incoming, outgoing };
}

/**
 * @param {string} requestId
 * @param {string} recipientUserId
 */
async function acceptRequest(requestId, recipientUserId) {
  if (!ObjectId.isValid(requestId)) return { ok: false, code: 'invalid_request' };
  const reqRow = await requestsCol().findOne({ _id: new ObjectId(requestId) });
  if (!reqRow || reqRow.status !== 'pending') {
    return { ok: false, code: 'not_found', message: 'That request is no longer available.' };
  }
  if (reqRow.toUserId !== recipientUserId) {
    return { ok: false, code: 'forbidden', message: 'You cannot accept this request.' };
  }
  const fromUser = await usersStore.findUserById(reqRow.fromUserId);
  const toUser = await usersStore.findUserById(reqRow.toUserId);
  if (!fromUser || !toUser) {
    return { ok: false, code: 'not_found', message: 'User not found.' };
  }
  await requestsCol().updateOne({ _id: reqRow._id }, { $set: { status: 'accepted', decidedAt: new Date() } });
  await addFriendship(reqRow.fromUserId, reqRow.toUserId);
  await chatStore.upsertDmThread(
    reqRow.fromUserId,
    reqRow.toUserId,
    {
      name: fromUser.name,
      avatarUrl:
        typeof fromUser.avatarUrl === 'string' && fromUser.avatarUrl.trim()
          ? fromUser.avatarUrl.trim()
          : null,
    },
    {
      name: toUser.name,
      avatarUrl:
        typeof toUser.avatarUrl === 'string' && toUser.avatarUrl.trim() ? toUser.avatarUrl.trim() : null,
    },
  );
  return { ok: true };
}

/**
 * @param {string} requestId
 * @param {string} recipientUserId
 */
async function declineRequest(requestId, recipientUserId) {
  if (!ObjectId.isValid(requestId)) return { ok: false, code: 'invalid_request' };
  const reqRow = await requestsCol().findOne({ _id: new ObjectId(requestId) });
  if (!reqRow || reqRow.status !== 'pending') {
    return { ok: false, code: 'not_found', message: 'That request is no longer available.' };
  }
  if (reqRow.toUserId !== recipientUserId && reqRow.fromUserId !== recipientUserId) {
    return { ok: false, code: 'forbidden', message: 'You cannot update this request.' };
  }
  await requestsCol().updateOne({ _id: reqRow._id }, { $set: { status: 'declined', decidedAt: new Date() } });
  return { ok: true };
}

/**
 * Everyone else on the server with friendship / pending-request flags for the viewer.
 * @param {string} viewerUserId
 */
async function listExploreUsers(viewerUserId) {
  const viewer = viewerUserId != null ? String(viewerUserId).trim() : '';
  const others = (await usersStore.listPublicUsers(viewer)).filter((u) => u.id !== viewer);
  if (others.length === 0) return [];

  const targetIds = others.map((o) => o.id);
  const pairKeys = targetIds.map((tid) => sortedPairKey(viewerUserId, tid));
  const friendRows = await friendshipsCol()
    .find({ pairKey: { $in: pairKeys } })
    .project({ pairKey: 1 })
    .toArray();
  const friendTargetIds = new Set(
    friendRows.map((r) => {
      const [a, b] = String(r.pairKey).split(':');
      return a === viewerUserId ? b : a;
    }),
  );

  const outgoingRows = await requestsCol()
    .find({ fromUserId: viewerUserId, toUserId: { $in: targetIds }, status: 'pending' })
    .project({ toUserId: 1 })
    .toArray();
  const outgoingSet = new Set(outgoingRows.map((r) => r.toUserId));

  const incomingRows = await requestsCol()
    .find({ toUserId: viewerUserId, fromUserId: { $in: targetIds }, status: 'pending' })
    .project({ fromUserId: 1, _id: 1 })
    .toArray();
  const incomingByFrom = new Map(incomingRows.map((r) => [r.fromUserId, r._id.toString()]));

  return others.map((o) => {
    let relation = 'none';
    if (friendTargetIds.has(o.id)) relation = 'friends';
    else if (outgoingSet.has(o.id)) relation = 'pending_out';
    else if (incomingByFrom.has(o.id)) relation = 'pending_in';
    return {
      ...o,
      relation,
      incomingRequestId: incomingByFrom.get(o.id) ?? null,
    };
  });
}

module.exports = {
  init,
  createFriendRequest,
  listRequestsForUser,
  acceptRequest,
  declineRequest,
  listExploreUsers,
};
