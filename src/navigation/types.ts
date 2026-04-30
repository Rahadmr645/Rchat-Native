import type { NavigatorScreenParams } from '@react-navigation/native';

export type ChatsStackParamList = {
  ChatsList: undefined;
  Settings: undefined;
  Profile: undefined;
  AddFriend: undefined;
  ExplorePeople: undefined;
  ChatRoom: {
    threadId: string;
    title: string;
    subtitle?: string;
    /** Letter shown on the peer avatar in the message list. */
    peerAvatarLetter?: string;
    /** Profile image URL for the other participant (DM). */
    peerAvatarUrl?: string;
    /** Other participant in a DM; used to refresh "last seen" / online in the header. */
    otherUserId?: string;
    /** If provided, ChatRoom auto-starts a call when screen opens. */
    startCallMedia?: 'audio' | 'video';
    /** Idempotency token to avoid duplicate auto-start triggers. */
    startCallNonce?: number;
  };
};

export type MainTabParamList = {
  ChatsTab: NavigatorScreenParams<ChatsStackParamList>;
  UpdatesTab: undefined;
  CallsTab: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};
