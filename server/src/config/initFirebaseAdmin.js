/**
 * Optional Firebase Admin SDK init from server/.env.
 * Expo push tokens are delivered via Expo's HTTP API (pushNotify.js), not FCM HTTP v1 directly.
 * Initializing here validates FIREBASE_* credentials and enables future FCM-native features if needed.
 */
const admin = require('firebase-admin');

let attempted = false;
let ok = false;

function tryInitFirebaseAdmin() {
  if (attempted) return ok;
  attempted = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    console.log(
      '[firebase] FIREBASE_* not fully set — skipping Admin SDK (Expo-only push is fine if clients use Expo push tokens).',
    );
    return false;
  }

  const privateKey = String(rawKey).replace(/\\n/g, '\n');
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    console.warn('[firebase] FIREBASE_PRIVATE_KEY looks invalid (missing PEM header).');
    return false;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: String(projectId).trim(),
          clientEmail: String(clientEmail).trim(),
          privateKey,
        }),
      });
    }
    ok = true;
    console.log(
      '[firebase] Admin SDK initialized. Outbound chat/call/friend pushes still use Expo Push API; ensure the same Firebase project is linked in EAS for Android FCM.',
    );
    return true;
  } catch (e) {
    console.error('[firebase] Admin SDK init failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

function getFirebaseMessaging() {
  if (!tryInitFirebaseAdmin()) return null;
  try {
    return admin.messaging();
  } catch {
    return null;
  }
}

module.exports = { tryInitFirebaseAdmin, getFirebaseMessaging };
