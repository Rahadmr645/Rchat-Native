import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getInitialMessages } from '../data/mockChats';
import { fetchMessages, fetchThreadPresence } from '../network/chatApi';
import { getChatSocket } from '../network/chatSocket';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';
import { DmCallSession, type DmCallOutgoingRequest } from '../calling/DmCallSession';
import type { ChatsStackParamList } from '../navigation/types';
import type { Message } from '../types/chat';

type ChatRoomRouteProp = RouteProp<ChatsStackParamList, 'ChatRoom'>;
type ChatRoomNav = NativeStackNavigationProp<ChatsStackParamList, 'ChatRoom'>;

const tabBarVisibleStyle = {
  backgroundColor: '#F7F8FA',
  borderTopColor: colors.divider,
} as const;

function selfLetter(user: { name: string; email: string } | null): string {
  if (!user) return '?';
  const n = user.name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  const e = user.email?.trim();
  if (e) return e.charAt(0).toUpperCase();
  return '?';
}

export function ChatRoomScreen() {
  const navigation = useNavigation<ChatRoomNav>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<ChatRoomRouteProp>();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { user, token } = useAuth();
  const threadId = params.threadId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenceSubtitle, setPresenceSubtitle] = useState(params.subtitle ?? '');
  const otherUserIdRef = useRef(params.otherUserId);
  const listRef = useRef<FlatList<Message>>(null);
  const [outgoingCall, setOutgoingCall] = useState<DmCallOutgoingRequest | null>(null);
  const startCallRef = useRef<(media: 'audio' | 'video') => void>(() => {});
  startCallRef.current = (media: 'audio' | 'video') => {
    if (!params.otherUserId) {
      Alert.alert('Calls', 'Voice and video calls are available only in direct messages.');
      return;
    }
    setOutgoingCall({ media, nonce: Date.now() });
  };

  const peerLetter =
    params.peerAvatarLetter?.trim() ||
    (params.title?.trim().length ? params.title.trim().charAt(0).toUpperCase() : '?');
  const meLetter = selfLetter(user);

  const refreshPresence = useCallback(async () => {
    if (!token) return;
    try {
      const p = await fetchThreadPresence(threadId, token);
      if (p.otherUserId) otherUserIdRef.current = p.otherUserId;
      setPresenceSubtitle(p.subtitle || '');
    } catch {
      /* keep previous subtitle */
    }
  }, [threadId, token]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={headerStyles.wrap}>
          <Text style={headerStyles.title} numberOfLines={1}>
            {params.title}
          </Text>
          {presenceSubtitle ? (
            <Text
              style={[headerStyles.subtitle, presenceSubtitle === 'online' && headerStyles.subtitleOnline]}
              numberOfLines={1}
            >
              {presenceSubtitle === 'online'
                ? 'online'
                : presenceSubtitle.toLowerCase().startsWith('last seen')
                  ? presenceSubtitle
                  : `Last seen ${presenceSubtitle}`}
            </Text>
          ) : null}
        </View>
      ),
      headerRight: () => (
        <View style={headerStyles.actions}>
          <Pressable hitSlop={10} onPress={() => startCallRef.current('audio')} style={headerStyles.iconHit}>
            <Ionicons name="call-outline" size={22} color="#fff" />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => startCallRef.current('video')} style={headerStyles.iconHit}>
            <Ionicons name="videocam-outline" size={24} color="#fff" />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => Alert.alert('Chat menu', 'Mute, search, and wallpaper can go here.')}
            style={headerStyles.iconHit}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, params.title, presenceSubtitle]);

  useFocusEffect(
    useCallback(() => {
      void refreshPresence();
    }, [refreshPresence]),
  );

  useFocusEffect(
    useCallback(() => {
      const stackNav = navigation.getParent();
      const tabNav = stackNav?.getParent?.() ?? stackNav;
      tabNav?.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        tabNav?.setOptions({ tabBarStyle: tabBarVisibleStyle });
      };
    }, [navigation]),
  );

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => void refreshPresence(), 25000);
    return () => clearInterval(id);
  }, [refreshPresence]);

  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket();
    const onPresence = (payload: { userId?: string }) => {
      const other = otherUserIdRef.current;
      if (other && payload?.userId === other) void refreshPresence();
    };
    socket.on('presence_changed', onPresence);
    return () => {
      socket.off('presence_changed', onPresence);
    };
  }, [token, refreshPresence]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await fetchMessages(threadId, token);
        if (!cancelled) setMessages(data);
      } catch {
        if (!cancelled) setMessages(getInitialMessages(threadId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, token]);

  useEffect(() => {
    const socket = getChatSocket();
    const join = () => {
      socket.emit('join_thread', threadId);
    };
    if (socket.connected) join();
    else socket.on('connect', join);

    const onThreadMessage = (payload: { threadId: string; message: Message }) => {
      if (payload.threadId !== threadId) return;
      const raw = payload.message;
      const outgoing =
        raw.senderUserId != null && user ? raw.senderUserId === user.id : raw.outgoing;
      const msg: Message = {
        id: raw.id,
        text: raw.text,
        timeLabel: raw.timeLabel,
        outgoing,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on('thread_message', onThreadMessage);

    return () => {
      socket.emit('leave_thread', threadId);
      socket.off('connect', join);
      socket.off('thread_message', onThreadMessage);
    };
  }, [threadId, user]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (keyboardHeight <= 0) return;
    const id = setTimeout(() => scrollToEnd(), Platform.OS === 'ios' ? 60 : 80);
    return () => clearTimeout(id);
  }, [keyboardHeight, scrollToEnd]);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  function handleSend(text: string) {
    getChatSocket().emit('send_message', { threadId, text });
  }

  const peerOnline = presenceSubtitle === 'online';

  return (
    <KeyboardAvoidingView
      style={[styles.safe, styles.flex]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {user ? (
        <DmCallSession
          threadId={threadId}
          myUserId={user.id}
          otherUserId={params.otherUserId}
          peerTitle={params.title}
          token={token}
          outgoingRequest={outgoingCall}
          onOutgoingRequestConsumed={() => setOutgoingCall(null)}
        />
      ) : null}
      <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
        <View style={styles.chatArea}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={t.bubbleOutgoing} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  peerAvatarLetter={peerLetter}
                  selfAvatarLetter={meLetter}
                  peerOnline={peerOnline}
                />
              )}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={scrollToEnd}
            />
          )}
        </View>
        <Composer onSend={handleSend} disabled={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const headerStyles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    paddingVertical: 2,
    maxWidth: Platform.OS === 'ios' ? 200 : 220,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    marginTop: 1,
    textTransform: 'none',
  },
  subtitleOnline: {
    color: 'rgba(160, 240, 200, 0.95)',
    textTransform: 'lowercase',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
    gap: 2,
  },
  iconHit: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: t.screenBg,
  },
  flex: {
    flex: 1,
  },
  chatArea: {
    flex: 1,
    backgroundColor: t.screenBg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.screenBg,
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
