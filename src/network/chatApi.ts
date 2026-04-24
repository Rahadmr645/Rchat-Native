import { getApiBaseUrl } from '../config';
import type { ChatThread, Message } from '../types/chat';

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
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
