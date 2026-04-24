export type ChatsStackParamList = {
  ChatsList: undefined;
  AddFriend: undefined;
  ExplorePeople: undefined;
  ChatRoom: {
    threadId: string;
    title: string;
    subtitle?: string;
    /** Letter shown on the peer avatar in the message list. */
    peerAvatarLetter?: string;
    /** Other participant in a DM; used to refresh "last seen" / online in the header. */
    otherUserId?: string;
  };
};

export type MainTabParamList = {
  ChatsTab: undefined;
  UpdatesTab: undefined;
  CallsTab: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};
