const PREFIX = 'RCHAT_CALLLOG:';

export type CallLogEnvelope = {
  callerUserId: string;
  actorUserId: string;
  media: 'audio' | 'video';
  durationSec: number;
  outcome: 'ended' | 'declined';
};

export function tryParseCallLog(text: string): CallLogEnvelope | null {
  const s = String(text || '');
  if (!s.startsWith(PREFIX)) return null;
  try {
    const o = JSON.parse(s.slice(PREFIX.length)) as Record<string, unknown>;
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

function formatDurationShort(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** WhatsApp-style line for the current user. */
export function formatCallLogLine(viewerUserId: string, env: CallLogEnvelope): string {
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
