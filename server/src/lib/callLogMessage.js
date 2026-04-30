const PREFIX = 'RCHAT_CALLLOG:';

/**
 * @param {{ callerUserId: string; actorUserId: string; media: 'audio' | 'video'; durationSec: number; outcome: 'ended' | 'declined' }} e
 */
function buildStoredText(e) {
  const payload = {
    v: 1,
    callerUserId: String(e.callerUserId),
    actorUserId: String(e.actorUserId),
    media: e.media === 'video' ? 'video' : 'audio',
    durationSec: Math.max(0, Math.min(86400, Math.floor(Number(e.durationSec) || 0))),
    outcome: e.outcome === 'declined' ? 'declined' : 'ended',
  };
  return `${PREFIX}${JSON.stringify(payload)}`;
}

/**
 * @param {string} text
 * @returns {{ callerUserId: string; actorUserId: string; media: 'audio' | 'video'; durationSec: number; outcome: 'ended' | 'declined' } | null}
 */
function tryParseStored(text) {
  const s = String(text || '');
  if (!s.startsWith(PREFIX)) return null;
  try {
    const o = JSON.parse(s.slice(PREFIX.length));
    if (!o || typeof o !== 'object') return null;
    const callerUserId = typeof o.callerUserId === 'string' ? o.callerUserId.trim() : '';
    const actorUserId = typeof o.actorUserId === 'string' ? o.actorUserId.trim() : '';
    if (!callerUserId || !actorUserId) return null;
    const media = o.media === 'video' ? 'video' : 'audio';
    const outcome = o.outcome === 'declined' ? 'declined' : 'ended';
    let durationSec = Number(o.durationSec);
    if (!Number.isFinite(durationSec) || durationSec < 0) durationSec = 0;
    if (durationSec > 86400) durationSec = 86400;
    return { callerUserId, actorUserId, media, durationSec: Math.floor(durationSec), outcome };
  } catch {
    return null;
  }
}

function formatDurationShort(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * One-line preview for chat list / notifications (viewer = Mongo user id string).
 * @param {string} viewerUserId
 * @param {string} plaintext decrypted message body
 */
function formatLineForViewer(viewerUserId, plaintext) {
  const env = tryParseStored(plaintext);
  if (!env) return null;
  const v = String(viewerUserId || '');
  const caller = env.callerUserId;
  const actor = env.actorUserId;
  const kind = env.media === 'video' ? 'video call' : 'voice call';
  if (env.outcome === 'declined') {
    if (v && v === actor) return `You declined the ${kind}`;
    if (v && v === caller) return `Outgoing ${kind} · Declined`;
    return `Call · Declined`;
  }
  if (env.durationSec > 0) {
    const dur = formatDurationShort(env.durationSec);
    if (v && v === caller) return `Outgoing ${kind} · ${dur}`;
    return `Incoming ${kind} · ${dur}`;
  }
  if (v && v === caller) return `Outgoing ${kind}`;
  return `Missed ${kind}`;
}

/**
 * @param {unknown} raw
 * @param {string} actorUserId
 * @param {string[]} memberUserIds
 */
function normalizeClientSummary(raw, actorUserId, memberUserIds) {
  if (!raw || typeof raw !== 'object') return null;
  const members = new Set((memberUserIds || []).map(String));
  const act = String(actorUserId);
  if (!members.has(act)) return null;
  const callerUserId = typeof raw.callerUserId === 'string' ? raw.callerUserId.trim() : '';
  if (!callerUserId || !members.has(callerUserId)) return null;
  const media = raw.media === 'video' ? 'video' : 'audio';
  let durationSec = Number(raw.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 0) durationSec = 0;
  if (durationSec > 86400) durationSec = 86400;
  return { callerUserId, actorUserId: act, media, durationSec: Math.floor(durationSec) };
}

module.exports = {
  PREFIX,
  buildStoredText,
  tryParseStored,
  formatLineForViewer,
  normalizeClientSummary,
  formatDurationShort,
};
