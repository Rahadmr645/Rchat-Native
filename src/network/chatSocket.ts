import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../config';

let socket: Socket | null = null;
let lastToken: string | null = null;

/**
 * Attach JWT for thread access and message sending. Call whenever the auth token changes.
 */
export function setChatAuthToken(token: string | null) {
  lastToken = token;
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
}

export function getChatSocket(): Socket {
  if (!socket) {
    socket = io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
      auth: { token: lastToken ?? '' },
    });
  }
  return socket;
}
