const bcrypt = require('bcrypt');

/** @type {import('mongodb').Db | null} */
let db = null;

function usersCol() {
  return db.collection('users');
}

/**
 * @param {import('mongodb').Db} database
 */
async function init(database) {
  db = database;
  await usersCol().createIndex({ email: 1 }, { unique: true });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = normalizeEmail(email);
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * @param {string} email
 * @param {string} passwordPlain
 * @param {string} [displayName]
 */
async function createUser(email, passwordPlain, displayName) {
  const norm = normalizeEmail(email);
  const hash = await bcrypt.hash(passwordPlain, 10);
  const name =
    typeof displayName === 'string' && displayName.trim()
      ? displayName.trim().slice(0, 80)
      : norm.split('@')[0] || 'User';
  const now = new Date();
  const doc = {
    email: norm,
    passwordHash: hash,
    name,
    createdAt: now,
  };
  const res = await usersCol().insertOne(doc);
  return { id: res.insertedId.toString(), email: norm, name };
}

/**
 * @param {string} email
 */
async function findUserByEmail(email) {
  const norm = normalizeEmail(email);
  return usersCol().findOne({ email: norm });
}

/**
 * @param {string} id
 */
async function findUserById(id) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(id)) return null;
  return usersCol().findOne({ _id: new ObjectId(id) });
}

/**
 * @param {string} email
 * @param {string} passwordPlain
 */
async function verifyPassword(email, passwordPlain) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(passwordPlain, user.passwordHash);
  if (!ok) return null;
  return { id: user._id.toString(), email: user.email, name: user.name };
}

/**
 * @param {string} userId
 * @param {Date} when
 */
async function setLastSeenAt(userId, when) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(userId)) return;
  await usersCol().updateOne({ _id: new ObjectId(userId) }, { $set: { lastSeenAt: when } });
}

/**
 * Public directory entries (no password), excluding one user id.
 * Always drops the excluded id in JS too so the viewer never appears if the query cannot use $ne.
 * @param {string} excludeUserId
 */
async function listPublicUsers(excludeUserId) {
  const { ObjectId } = require('mongodb');
  const rawEx = excludeUserId != null ? String(excludeUserId).trim() : '';
  const filter =
    rawEx && ObjectId.isValid(rawEx) ? { _id: { $ne: new ObjectId(rawEx) } } : {};
  const docs = await usersCol()
    .find(filter, { projection: { email: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs
    .map((u) => ({ id: u._id.toString(), name: u.name, email: u.email }))
    .filter((row) => !rawEx || row.id !== rawEx);
}

const MAX_EXPO_PUSH_TOKENS = 12;

/**
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function getExpoPushTokens(userId) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(userId)) return [];
  const u = await usersCol().findOne({ _id: new ObjectId(userId) }, { projection: { expoPushTokens: 1 } });
  const raw = u?.expoPushTokens;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t) => typeof t === 'string' && t.length > 0);
}

/**
 * @param {string} userId
 * @param {string} expoPushToken
 */
async function addExpoPushToken(userId, expoPushToken) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(userId)) return;
  const token = String(expoPushToken || '').trim();
  if (!token || token.length > 512) return;
  const oid = new ObjectId(userId);
  await usersCol().updateOne({ _id: oid }, { $pull: { expoPushTokens: token } });
  await usersCol().updateOne({ _id: oid }, { $push: { expoPushTokens: { $each: [token], $position: 0 } } });
  const u = await usersCol().findOne({ _id: oid }, { projection: { expoPushTokens: 1 } });
  const list = Array.isArray(u?.expoPushTokens) ? u.expoPushTokens : [];
  if (list.length > MAX_EXPO_PUSH_TOKENS) {
    const drop = list.slice(MAX_EXPO_PUSH_TOKENS);
    await usersCol().updateOne({ _id: oid }, { $pull: { expoPushTokens: { $in: drop } } });
  }
}

/**
 * @param {string} userId
 * @param {string} expoPushToken
 */
async function removeExpoPushToken(userId, expoPushToken) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(userId)) return;
  const token = String(expoPushToken || '').trim();
  if (!token) return;
  await usersCol().updateOne({ _id: new ObjectId(userId) }, { $pull: { expoPushTokens: token } });
}

module.exports = {
  init,
  normalizeEmail,
  isValidEmail,
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  setLastSeenAt,
  listPublicUsers,
  getExpoPushTokens,
  addExpoPushToken,
  removeExpoPushToken,
};
