/** Matches server `DELETED_FOR_EVERYONE_PLACEHOLDER` (WhatsApp-style). */
export const DELETED_FOR_EVERYONE_MESSAGE = 'This message was deleted.';

export type ChatThread = {
  id: string;
  name: string;
  avatarLetter: string;
  /** HTTPS profile image for the other person in a DM. */
  avatarUrl?: string;
  lastMessage: string;
  timeLabel: string;
  unreadCount?: number;
  lastSeen?: string;
};

export type Message = {
  id: string;
  text: string;
  timeLabel: string;
  outgoing: boolean;
  /** Present on server payloads for DM threads; used to compute `outgoing` per viewer. */
  senderUserId?: string | null;
  /** Local-only: message is still waiting for server confirmation. */
  sending?: boolean;
  /** Message lifecycle for outgoing messages. */
  deliveryStatus?: 'sent' | 'delivered' | 'seen';
  /** Local-only correlation id to replace pending message when server echoes back. */
  clientTempId?: string;
  /** True when another member has read this outgoing message. */
  seenByOther?: boolean;
  /** Server: message was deleted for everyone; content replaced by placeholder. */
  isDeletedForEveryone?: boolean;
};
