export type ChatThread = {
  id: string;
  name: string;
  avatarLetter: string;
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
};
