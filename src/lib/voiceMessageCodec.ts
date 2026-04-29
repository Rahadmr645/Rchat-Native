/** Stable voice payload over chat text (same pattern as photo messages). */
export const VOICE_MSG_PREFIX = '🎤RCHAT_B64:';

export type VoicePayload = {
  /** HTTPS URL (e.g. Cloudinary) */
  u: string;
  /** Duration in milliseconds */
  ms: number;
};

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'undefined') {
    throw new Error('btoa not available');
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  if (typeof atob === 'undefined') {
    throw new Error('atob not available');
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeVoiceMessage(payload: VoicePayload): string {
  return VOICE_MSG_PREFIX + utf8ToBase64(JSON.stringify(payload));
}

export function tryDecodeVoiceMessage(text: string): VoicePayload | null {
  if (!text.startsWith(VOICE_MSG_PREFIX)) return null;
  const b64 = text.slice(VOICE_MSG_PREFIX.length).trim();
  if (!b64) return null;
  try {
    const raw = base64ToUtf8(b64);
    const data = JSON.parse(raw) as VoicePayload;
    if (!data || typeof data.u !== 'string' || !data.u.trim()) return null;
    if (typeof data.ms !== 'number' || !Number.isFinite(data.ms)) return null;
    return data;
  } catch {
    return null;
  }
}
