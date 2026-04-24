import type { ChatThread, Message } from '../types/chat';

/** Offline fallback when the API is unreachable — no bundled demo threads. */
export const MOCK_THREADS: ChatThread[] = [];

const initialMessages: Record<string, Message[]> = {};

export function getInitialMessages(threadId: string): Message[] {
  return [...(initialMessages[threadId] ?? [])];
}
