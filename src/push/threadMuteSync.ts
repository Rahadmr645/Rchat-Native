import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Socket } from 'socket.io-client';

/** Must match `ChatRoomScreen` mute keys. */
export const THREAD_MUTE_STORAGE_PREFIX = 'rchat_thread_mute_v1:';

export async function fetchMutedThreadIdsFromStorage(): Promise<string[]> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(THREAD_MUTE_STORAGE_PREFIX));
    if (keys.length === 0) return [];
    const pairs = await AsyncStorage.multiGet(keys);
    return pairs.filter(([, v]) => v === '1').map(([k]) => k.slice(THREAD_MUTE_STORAGE_PREFIX.length));
  } catch {
    return [];
  }
}

export function emitThreadPushMute(socket: Socket, threadId: string, muted: boolean): void {
  socket.emit('thread_push_mute', { threadId, muted });
}

export function emitThreadPushMuteSync(socket: Socket, threadIds: string[]): void {
  socket.emit('thread_push_mute_sync', { threadIds });
}
