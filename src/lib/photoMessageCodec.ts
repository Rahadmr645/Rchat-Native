/** Stable photo payload over chat text (encryption-safe, no pipe/URL parse bugs). */
export const PHOTO_MSG_PREFIX = '📷RCHAT_B64:';

export type PhotoPayload = {
  u: string;
  n?: string;
  t?: string;
  w?: number;
  h?: number;
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

export function encodePhotoMessage(payload: PhotoPayload): string {
  return PHOTO_MSG_PREFIX + utf8ToBase64(JSON.stringify(payload));
}

export function tryDecodePhotoMessage(text: string): PhotoPayload | null {
  if (!text.startsWith(PHOTO_MSG_PREFIX)) return null;
  const b64 = text.slice(PHOTO_MSG_PREFIX.length).trim();
  if (!b64) return null;
  try {
    const raw = base64ToUtf8(b64);
    const data = JSON.parse(raw) as PhotoPayload;
    if (!data || typeof data.u !== 'string' || !data.u.trim()) return null;
    return data;
  } catch {
    return null;
  }
}
