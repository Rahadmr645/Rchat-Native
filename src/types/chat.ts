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
};
