import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config';
import type { ChatThread, Message } from '../types/chat';

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* noop */
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return res.json() as Promise<T>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchThreads(token: string): Promise<ChatThread[]> {
  const res = await fetch(`${getApiBaseUrl()}/api/threads`, { headers: authHeaders(token) });
  return parseJson<ChatThread[]>(res);
}

export async function fetchMessages(threadId: string, token: string): Promise<Message[]> {
  const res = await fetch(`${getApiBaseUrl()}/api/threads/${encodeURIComponent(threadId)}/messages`, {
    headers: authHeaders(token),
  });
  return parseJson<Message[]>(res);
}

export type ThreadPresence = {
  subtitle: string;
  otherUserId: string | null;
};

export async function fetchThreadPresence(threadId: string, token: string): Promise<ThreadPresence> {
  const res = await fetch(`${getApiBaseUrl()}/api/threads/${encodeURIComponent(threadId)}/presence`, {
    headers: authHeaders(token),
  });
  return parseJson<ThreadPresence>(res);
}

export async function uploadThreadImage(
  params: { threadId: string; uri: string; fileName: string; mimeType?: string },
  token: string,
): Promise<{ url: string; publicId: string }> {
  const body = new FormData();
  body.append('threadId', params.threadId);
  const name = params.fileName || `photo-${Date.now()}.jpg`;
  const type = params.mimeType || 'image/jpeg';

  if (Platform.OS === 'web') {
    const blob = await fetch(params.uri).then((r) => r.blob());
    body.append('image', blob, name);
  } else {
    body.append(
      'image',
      {
        uri: params.uri,
        name,
        type,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${getApiBaseUrl()}/api/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return parseJson<{ url: string; publicId: string }>(res);
}

export async function uploadThreadVoice(
  params: { threadId: string; uri: string; fileName: string; mimeType?: string },
  token: string,
): Promise<{ url: string; publicId: string }> {
  const body = new FormData();
  body.append('threadId', params.threadId);
  const name = params.fileName || `voice-${Date.now()}.m4a`;
  const type = params.mimeType || 'audio/m4a';

  if (Platform.OS === 'web') {
    const blob = await fetch(params.uri).then((r) => r.blob());
    body.append('voice', blob, name);
  } else {
    body.append(
      'voice',
      {
        uri: params.uri,
        name,
        type,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${getApiBaseUrl()}/api/uploads/voice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return parseJson<{ url: string; publicId: string }>(res);
}
