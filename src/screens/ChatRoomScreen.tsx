import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getInitialMessages } from '../data/mockChats';
import { tryDecodePhotoMessage } from '../lib/photoMessageCodec';
import { encodePhotoMessage } from '../lib/photoMessageCodec';
import { tryDecodeVoiceMessage } from '../lib/voiceMessageCodec';
import { encodeVoiceMessage } from '../lib/voiceMessageCodec';
import {
  deleteThreadMessages,
  fetchMessages,
  fetchThreadPresence,
  uploadThreadImage,
  uploadThreadVoice,
} from '../network/chatApi';
import { emitThreadPushMute, THREAD_MUTE_STORAGE_PREFIX } from '../push/threadMuteSync';
import { getChatSocket } from '../network/chatSocket';
import { MessageBubble } from '../components/MessageBubble';
import type { MessageAction } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';
import { DmCallSession, type DmCallOutgoingRequest } from '../calling/DmCallSession';
import type { ChatsStackParamList } from '../navigation/types';
import type { Message } from '../types/chat';
import { DELETED_FOR_EVERYONE_MESSAGE } from '../types/chat';
import * as Clipboard from 'expo-clipboard';

type ChatRoomRouteProp = RouteProp<ChatsStackParamList, 'ChatRoom'>;
type ChatRoomNav = NativeStackNavigationProp<ChatsStackParamList, 'ChatRoom'>;
type ActivityKind = 'typing' | 'speaking';

const NAVBAR_OFFSET_CHAT_MENU = Platform.OS === 'ios' ? 52 : 56;

function muteStorageKey(threadId: string) {
  return `${THREAD_MUTE_STORAGE_PREFIX}${threadId}`;
}

function selfLetter(user: { name: string; email: string } | null): string {
  if (!user) return '?';
  const n = user.name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  const e = user.email?.trim();
  if (e) return e.charAt(0).toUpperCase();
  return '?';
}

function replyPreviewText(rawText: string): string {
  const voice = tryDecodeVoiceMessage(rawText);
  if (voice) return 'Voice message';
  const photo = tryDecodePhotoMessage(rawText);
  if (photo) return photo.t?.trim() || 'Photo';
  const clean = rawText.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Message';
  return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
}

function encodeReplyMessage(quoted: string, body: string): string {
  return `RCHAT_REPLY|q=${encodeURIComponent(quoted)}|b=${encodeURIComponent(body)}`;
}

function nowTimeLabel(): string {
  const d = new Date();
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Only the message owner may see "Delete for both" (server-backed outgoing only). */
function canShowDeleteForEveryone(
  messageIds: string[],
  messages: Message[],
  userId: string | undefined,
): boolean {
  const uid = userId != null ? String(userId) : '';
  if (!uid || messageIds.length === 0) return false;
  const rows = messageIds
    .map((id) => messages.find((m) => m.id === id))
    .filter((m): m is Message => Boolean(m));
  if (rows.length !== messageIds.length) return false;
  return rows.every((m) => {
    if (m.isDeletedForEveryone || m.text === DELETED_FOR_EVERYONE_MESSAGE) return false;
    if (!m.outgoing || m.sending) return false;
    if (!/^[0-9a-f]{24}$/i.test(m.id)) return false;
    if (m.senderUserId != null) return String(m.senderUserId) === uid;
    return true;
  });
}

export function ChatRoomScreen() {
  const navigation = useNavigation<ChatRoomNav>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const tabBarVisibleStyle = useMemo(
    () => ({
      backgroundColor: colors.tabBarBackground,
      borderTopColor: colors.divider,
    }),
    [colors],
  );
  const { params } = useRoute<ChatRoomRouteProp>();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(64);
  const [windowHeight, setWindowHeight] = useState(() => Dimensions.get('window').height);
  const baseWindowHeightRef = useRef(windowHeight);
  const { user, token } = useAuth();
  const threadId = params.threadId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenceSubtitle, setPresenceSubtitle] = useState(params.subtitle ?? '');
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const otherUserIdRef = useRef(params.otherUserId);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const [outgoingCall, setOutgoingCall] = useState<DmCallOutgoingRequest | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Record<string, boolean>>({});
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Record<string, boolean>>({});
  const [starredMessageIds, setStarredMessageIds] = useState<Record<string, boolean>>({});
  const [reactionByMessageId, setReactionByMessageId] = useState<Record<string, string>>({});
  const [composerPreset, setComposerPreset] = useState<{ text: string; token: number } | null>(null);
  const [replyPreview, setReplyPreview] = useState<string | null>(null);
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false);
  const [threadMuted, setThreadMuted] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  /** Non-null while a blocking async action runs (delete, upload, refresh, …). */
  const [blockingLabel, setBlockingLabel] = useState<string | null>(null);
  const startCallRef = useRef<(media: 'audio' | 'video') => void>(() => {});
  const consumedAutoCallNonceRef = useRef<number | null>(null);
  startCallRef.current = (media: 'audio' | 'video') => {
    if (!params.otherUserId) {
      Alert.alert('Calls', 'Voice and video calls are available only in direct messages.');
      return;
    }
    setOutgoingCall({ media, nonce: Date.now() });
  };

  useEffect(() => {
    const media = params.startCallMedia;
    const nonce = params.startCallNonce;
    if (!media || typeof nonce !== 'number') return;
    if (consumedAutoCallNonceRef.current === nonce) return;
    consumedAutoCallNonceRef.current = nonce;
    startCallRef.current(media);
  }, [params.startCallMedia, params.startCallNonce]);

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

  const emitThreadActivity = useCallback(
    (kind: ActivityKind, active: boolean) => {
      if (!token) return;
      getChatSocket().emit('thread_activity', { threadId, kind, active });
    },
    [threadId, token],
  );

  const headerSubtitleText = remoteSpeaking
    ? 'speaking...'
    : remoteTyping
      ? 'typing...'
      : presenceSubtitle === 'online'
        ? 'online'
        : presenceSubtitle.toLowerCase().startsWith('last seen')
          ? presenceSubtitle
          : presenceSubtitle
            ? `Last seen ${presenceSubtitle}`
            : '';

  const openChatHeaderMenu = useCallback(() => setChatHeaderMenuOpen(true), []);
  const closeChatHeaderMenu = useCallback(() => setChatHeaderMenuOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(muteStorageKey(threadId));
        const muted = v === '1';
        if (!cancelled) {
          setThreadMuted(muted);
          if (token) emitThreadPushMute(getChatSocket(), threadId, muted);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, token]);

  const displayedMessages = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!chatSearchOpen || !q) return messages;
    return messages.filter((m) => m.text.toLowerCase().includes(q));
  }, [messages, chatSearchQuery, chatSearchOpen]);

  const selectedCount = useMemo(
    () => Object.values(selectedMessageIds).filter(Boolean).length,
    [selectedMessageIds],
  );
  const selectionModeActive = multiSelectMode || selectedCount > 0;

  const handleChatMenuViewInfo = useCallback(() => {
    closeChatHeaderMenu();
    const lines = [
      headerSubtitleText ? `Status: ${headerSubtitleText}` : null,
      params.otherUserId ? `User ID: ${params.otherUserId}` : null,
      `Thread: ${threadId}`,
    ].filter((line): line is string => Boolean(line));
    Alert.alert(params.title, lines.join('\n\n'));
  }, [closeChatHeaderMenu, params.title, params.otherUserId, threadId, headerSubtitleText]);

  const handleChatMenuSearch = useCallback(() => {
    closeChatHeaderMenu();
    setChatSearchOpen(true);
  }, [closeChatHeaderMenu]);

  const handleChatMenuSelectMessages = useCallback(() => {
    closeChatHeaderMenu();
    setMultiSelectMode(true);
  }, [closeChatHeaderMenu]);

  const handleChatMenuMuteToggle = useCallback(async () => {
    const next = !threadMuted;
    setThreadMuted(next);
    setBlockingLabel('Saving…');
    try {
      try {
        await AsyncStorage.setItem(muteStorageKey(threadId), next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (token) emitThreadPushMute(getChatSocket(), threadId, next);
      closeChatHeaderMenu();
      Alert.alert(
        next ? 'Muted' : 'Unmuted',
        next
          ? 'Push alerts for this chat are off on this device and will not be sent from the server until you unmute.'
          : 'Notifications for this chat are on again.',
      );
    } finally {
      setBlockingLabel(null);
    }
  }, [threadMuted, threadId, closeChatHeaderMenu, token]);

  const handleChatMenuCopyThreadId = useCallback(async () => {
    closeChatHeaderMenu();
    setBlockingLabel('Copying…');
    try {
      await Clipboard.setStringAsync(threadId);
      Alert.alert('Copied', 'Thread ID copied to clipboard.');
    } catch {
      Alert.alert('Copy', 'Could not copy thread ID.');
    } finally {
      setBlockingLabel(null);
    }
  }, [closeChatHeaderMenu, threadId]);

  useLayoutEffect(() => {
    const peerPhoto = params.peerAvatarUrl?.trim() || '';
    navigation.setOptions({
      headerTitle: () => (
        <View style={headerStyles.titleRow}>
          {peerPhoto ? (
            <Image source={{ uri: peerPhoto }} style={headerStyles.headerAvatar} accessibilityLabel="User avatar" />
          ) : (
            <View style={headerStyles.headerAvatarFallback}>
              <Ionicons name="person" size={16} color="#fff" />
            </View>
          )}
          <View style={headerStyles.wrap}>
            <Text style={headerStyles.title} numberOfLines={1}>
              {params.title}
            </Text>
            {headerSubtitleText ? (
              <Text
                style={[
                  headerStyles.subtitle,
                  headerSubtitleText === 'online' && headerStyles.subtitleOnline,
                  (remoteTyping || remoteSpeaking) && headerStyles.subtitleActivity,
                ]}
                numberOfLines={1}
              >
                {headerSubtitleText}
              </Text>
            ) : null}
          </View>
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
            onPress={openChatHeaderMenu}
            style={headerStyles.iconHit}
            accessibilityLabel="Chat options"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [
    navigation,
    params.title,
    params.peerAvatarUrl,
    headerSubtitleText,
    remoteTyping,
    remoteSpeaking,
    openChatHeaderMenu,
  ]);

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
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowHeight(window.height);
    });
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    // Keep the baseline in sync when keyboard is closed.
    if (keyboardHeight <= 0 && windowHeight > baseWindowHeightRef.current) {
      baseWindowHeightRef.current = windowHeight;
    }
  }, [keyboardHeight, windowHeight]);

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
    const load = async () => {
      setLoading(true);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await fetchMessages(threadId, token);
        if (!cancelled) setMessages(data);
      } catch {
        if (!cancelled) setMessages(getInitialMessages(threadId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [threadId, token]);

  const refreshMessages = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchMessages(threadId, token);
      setMessages(data);
    } catch {
      /* keep current messages */
    }
  }, [threadId, token]);

  const handleChatMenuRefresh = useCallback(() => {
    closeChatHeaderMenu();
    void (async () => {
      setBlockingLabel('Refreshing…');
      try {
        await refreshMessages();
        Alert.alert('Chat', 'Messages refreshed.');
      } finally {
        setBlockingLabel(null);
      }
    })();
  }, [closeChatHeaderMenu, refreshMessages]);

  const executeDeleteMessages = useCallback(
    async (ids: string[], scope: 'me' | 'everyone') => {
      setBlockingLabel('Deleting…');
      try {
        const serverIds = ids.filter((id) => /^[0-9a-f]{24}$/i.test(id));
        if (token && ids.length > 0 && serverIds.length === 0) {
          Alert.alert(
            scope === 'everyone' ? 'Delete for both' : 'Delete',
            'These messages are not on the server yet (for example still sending). Wait until they are sent, then try again.',
          );
          return;
        }
        if (token && serverIds.length > 0) {
          await deleteThreadMessages(threadId, token, { messageIds: serverIds, scope });
        }
        await refreshMessages();
        setSelectedMessageIds({});
        setMultiSelectMode(false);
      } catch (e) {
        Alert.alert('Delete failed', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setBlockingLabel(null);
      }
    },
    [token, threadId, refreshMessages],
  );

  const promptDeleteMessages = useCallback(
    (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      const title =
        unique.length === 1 ? 'Delete this message?' : `Delete ${unique.length} messages?`;
      const showForBoth = canShowDeleteForEveryone(unique, messages, user?.id);
      const message = showForBoth
        ? 'Delete for me hides these messages only on your account. Delete for both removes your messages from this chat for everyone.'
        : 'Delete for me hides these messages only on your account. Only the sender can remove a message for everyone.';
      const buttons: {
        text: string;
        style?: 'default' | 'cancel' | 'destructive';
        onPress?: () => void;
      }[] = [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => void executeDeleteMessages(unique, 'me'),
        },
      ];
      if (showForBoth) {
        buttons.push({
          text: 'Delete for both',
          style: 'destructive',
          onPress: () => void executeDeleteMessages(unique, 'everyone'),
        });
      }
      Alert.alert(title, message, buttons);
    },
    [executeDeleteMessages, messages, user?.id],
  );

  const handleToggleSelect = useCallback((message: Message) => {
    setSelectedMessageIds((prev) => ({ ...prev, [message.id]: !prev[message.id] }));
  }, []);

  useEffect(() => {
    if (!selectionModeActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedMessageIds({});
      setMultiSelectMode(false);
      return true;
    });
    return () => sub.remove();
  }, [selectionModeActive]);

  /** Leave thread room while app is backgrounded so the server can send push (it skips push when "viewing"). */
  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket();
    const tid = String(threadId);
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        socket.emit('join_thread', tid);
        socket.emit('mark_thread_read', tid);
      } else {
        socket.emit('leave_thread', tid);
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [token, threadId]);

  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket();
    const markThreadRead = () => {
      socket.emit('mark_thread_read', threadId);
    };
    const join = () => {
      socket.emit('join_thread', threadId);
      markThreadRead();
    };
    if (socket.connected) join();
    else socket.on('connect', join);

    const onThreadMessage = (payload: { threadId: string; message: Message; clientTempId?: string }) => {
      if (String(payload.threadId) !== String(threadId)) return;
      const raw = payload.message;
      const outgoing =
        raw.senderUserId != null && user ? String(raw.senderUserId) === String(user.id) : raw.outgoing;
      const msg: Message = {
        id: raw.id,
        text: raw.text,
        timeLabel: raw.timeLabel,
        outgoing,
        sending: false,
        seenByOther: Boolean(raw.seenByOther),
        deliveryStatus: raw.deliveryStatus ?? (Boolean(raw.seenByOther) ? 'seen' : 'sent'),
        isDeletedForEveryone: Boolean(raw.isDeletedForEveryone),
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if (outgoing && payload.clientTempId) {
          const hasPending = prev.some((m) => m.clientTempId === payload.clientTempId);
          if (hasPending) {
            return prev.map((m) => (m.clientTempId === payload.clientTempId ? msg : m));
          }
        }
        return [...prev, msg];
      });
      if (!outgoing) markThreadRead();
    };
    socket.on('thread_message', onThreadMessage);
    const onThreadSeen = (payload: {
      threadId?: string;
      readerUserId?: string;
      messageId?: string;
      messageIds?: string[];
      seenMessageIds?: string[];
    }) => {
      if (String(payload?.threadId ?? '') !== String(threadId)) return;
      const readerId = payload?.readerUserId != null ? String(payload.readerUserId) : '';
      const myId = user?.id != null ? String(user.id) : '';
      const otherId = otherUserIdRef.current != null ? String(otherUserIdRef.current) : '';
      // Ignore ambiguous/self seen events to avoid false "seen" ticks.
      if (!readerId) return;
      if (myId && readerId === myId) return;
      if (otherId && readerId !== otherId) return;
      const ids = new Set(
        [payload?.messageId, ...(payload?.messageIds ?? []), ...(payload?.seenMessageIds ?? [])]
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      );
      if (ids.size > 0) {
        setMessages((prev) =>
          prev.map((m) => (ids.has(m.id) ? { ...m, seenByOther: true, deliveryStatus: 'seen' } : m)),
        );
      }
      // Server is source of truth for per-message read status.
      void refreshMessages();
    };
    socket.on('thread_seen', onThreadSeen);
    const onThreadMessageStatus = (payload: { threadId?: string; messageId?: string; deliveryStatus?: Message['deliveryStatus'] }) => {
      if (String(payload?.threadId ?? '') !== String(threadId)) return;
      if (!payload?.messageId || !payload?.deliveryStatus) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== payload.messageId) return m;
          if (payload.deliveryStatus === 'seen') {
            return { ...m, deliveryStatus: 'seen', seenByOther: true };
          }
          if (m.deliveryStatus === 'seen') return m;
          return { ...m, deliveryStatus: payload.deliveryStatus };
        }),
      );
    };
    socket.on('thread_message_status', onThreadMessageStatus);
    const onThreadsChanged = () => {
      void refreshMessages();
    };
    socket.on('threads_changed', onThreadsChanged);
    const onThreadMessagesDeleted = (payload: {
      threadId?: string;
      messageIds?: string[];
      scope?: 'me' | 'everyone';
    }) => {
      if (String(payload?.threadId ?? '') !== String(threadId)) return;
      if (
        payload?.scope === 'everyone' &&
        Array.isArray(payload.messageIds) &&
        payload.messageIds.length > 0
      ) {
        const idSet = new Set(payload.messageIds.map((id) => String(id)));
        setMessages((prev) =>
          prev.map((m) =>
            idSet.has(m.id)
              ? { ...m, text: DELETED_FOR_EVERYONE_MESSAGE, isDeletedForEveryone: true }
              : m,
          ),
        );
      }
      void refreshMessages();
    };
    socket.on('thread_messages_deleted', onThreadMessagesDeleted);
    const onThreadActivity = (payload: {
      threadId?: string;
      kind?: ActivityKind;
      active?: boolean;
      fromUserId?: string;
    }) => {
      if (String(payload?.threadId ?? '') !== String(threadId)) return;
      if (!payload.fromUserId || payload.fromUserId === user?.id) return;
      if (payload.kind === 'typing') {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        setRemoteTyping(Boolean(payload.active));
        if (payload.active) {
          typingTimeoutRef.current = setTimeout(() => setRemoteTyping(false), 2200);
        }
      }
      if (payload.kind === 'speaking') {
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
        setRemoteSpeaking(Boolean(payload.active));
        if (payload.active) {
          speakingTimeoutRef.current = setTimeout(() => setRemoteSpeaking(false), 3200);
        }
      }
    };
    socket.on('thread_activity', onThreadActivity);

    return () => {
      emitThreadActivity('typing', false);
      emitThreadActivity('speaking', false);
      setRemoteTyping(false);
      setRemoteSpeaking(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      socket.emit('leave_thread', threadId);
      socket.off('connect', join);
      socket.off('thread_message', onThreadMessage);
      socket.off('thread_seen', onThreadSeen);
      socket.off('thread_message_status', onThreadMessageStatus);
      socket.off('threads_changed', onThreadsChanged);
      socket.off('thread_messages_deleted', onThreadMessagesDeleted);
      socket.off('thread_activity', onThreadActivity);
    };
  }, [threadId, user, token, refreshMessages, emitThreadActivity]);

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
    const payload = replyPreview ? encodeReplyMessage(replyPreview, text) : text;
    const clientTempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [
      ...prev,
      {
        id: clientTempId,
        clientTempId,
        text: payload,
        timeLabel: nowTimeLabel(),
        outgoing: true,
        sending: true,
        seenByOther: false,
        deliveryStatus: 'sent',
      },
    ]);
    getChatSocket().emit('send_message', { threadId, text: payload, clientTempId });
    setReplyPreview(null);
  }

  const toggleMark = useCallback(
    (setter: (value: (prev: Record<string, boolean>) => Record<string, boolean>) => void, id: string) => {
      setter((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [],
  );

  const handleMessageAction = useCallback(
    async ({ message, action }: { message: Message; action: MessageAction }) => {
      if (action === 'reply') {
        const snippet = replyPreviewText(message.text);
        setReplyPreview(snippet);
        return;
      }
      if (action === 'copy') {
        setBlockingLabel('Copying…');
        try {
          await Clipboard.setStringAsync(message.text);
          Alert.alert('Copied', 'Message copied to clipboard.');
        } finally {
          setBlockingLabel(null);
        }
        return;
      }
      if (action === 'forward') {
        // Keep original payload unchanged so photo/voice codec messages still render correctly.
        handleSend(message.text);
        Alert.alert('Forward', 'Message forwarded.');
        return;
      }
      if (action === 'pin') {
        toggleMark(setPinnedMessageIds, message.id);
        return;
      }
      if (action === 'star') {
        toggleMark(setStarredMessageIds, message.id);
        return;
      }
      if (action === 'select') {
        setMultiSelectMode(true);
        toggleMark(setSelectedMessageIds, message.id);
        return;
      }
      if (action === 'save' || action === 'share') {
        setBlockingLabel('Sharing…');
        try {
          await Share.share({ message: message.text });
        } catch {
          Alert.alert('Share', 'Could not open share options.');
        } finally {
          setBlockingLabel(null);
        }
        return;
      }
      if (action === 'report') {
        Alert.alert('Report', 'Message reported. Thank you.');
        return;
      }
      if (action === 'delete') {
        promptDeleteMessages([message.id]);
      }
    },
    [handleSend, toggleMark, promptDeleteMessages],
  );

  async function handleSendVoice(payload: { uri: string; durationMs: number }) {
    if (!token) {
      Alert.alert('Sign in required', 'You must be logged in to send voice messages.');
      return;
    }
    setBlockingLabel('Sending voice…');
    try {
      const extFromUri = /\.(m4a|caf|aac|mp3|wav|webm|3gp)$/i.exec(payload.uri)?.[1]?.toLowerCase();
      const fileName = `voice-${Date.now()}.${extFromUri || 'm4a'}`;
      const mimeType =
        extFromUri === 'mp3'
          ? 'audio/mpeg'
          : extFromUri === 'wav'
            ? 'audio/wav'
            : extFromUri === 'webm'
              ? 'audio/webm'
              : 'audio/m4a';
      const uploaded = await uploadThreadVoice(
        { threadId, uri: payload.uri, fileName, mimeType },
        token,
      );
      getChatSocket().emit('send_message', {
        threadId,
        text: encodeVoiceMessage({ u: uploaded.url, ms: payload.durationMs }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Voice upload failed', msg);
    } finally {
      setBlockingLabel(null);
    }
  }

  async function handleSendPhoto(payload: {
    uri: string;
    fileName: string;
    width: number;
    height: number;
    mimeType?: string;
    caption?: string;
  }) {
    const cleanName = payload.fileName || 'photo.jpg';
    const baseName = cleanName.replace(/\.[a-z0-9]+$/i, '');
    const looksLikeCameraFile = /^[0-9_-]{6,}$/.test(baseName) || /^img[_-]?\d+/i.test(baseName);
    const title = payload.caption?.trim() || (looksLikeCameraFile ? 'Photo' : baseName) || 'Photo';

    const emitCloudPhoto = (cloudUrl: string) => {
      getChatSocket().emit('send_message', {
        threadId,
        text: encodePhotoMessage({
          u: cloudUrl,
          n: cleanName,
          t: title,
          w: payload.width,
          h: payload.height,
        }),
      });
    };

    if (!token) {
      Alert.alert('Sign in required', 'You must be logged in to send photos.');
      return;
    }
    setBlockingLabel('Sending photo…');
    try {
      const uploaded = await uploadThreadImage(
        {
          threadId,
          uri: payload.uri,
          fileName: cleanName,
          mimeType: payload.mimeType,
        },
        token,
      );
      emitCloudPhoto(uploaded.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Photo upload failed', `${msg}\n\nOnly Cloudinary URLs are sent so receivers can see images.`);
    } finally {
      setBlockingLabel(null);
    }
  }

  const peerOnline = presenceSubtitle === 'online';
  const isWeb = Platform.OS === 'web';
  // Web: `Dimensions` vs visual viewport mismatch makes resize-based "keyboard lift" huge and
  // floats the composer mid-screen. Native keeps resize heuristic for soft-keyboard shrink.
  const keyboardLiftFromEvent = isWeb
    ? Math.max(0, keyboardHeight)
    : Math.max(0, keyboardHeight - insets.bottom);
  const keyboardLiftFromResize = isWeb ? 0 : Math.max(0, baseWindowHeightRef.current - windowHeight);
  const keyboardLift = Math.max(keyboardLiftFromEvent, keyboardLiftFromResize);
  const keyboardGap = !isWeb && keyboardLift > 0 ? 48 : 0;
  const composerBottom = isWeb ? insets.bottom : insets.bottom + keyboardLift + keyboardGap;
  const webKeyboardInset = isWeb ? keyboardHeight : 0;
  const selectionToolbarInset = selectedCount > 0 ? 50 : 0;
  const listBottomInset =
    (isWeb ? composerHeight + 20 : composerHeight + composerBottom) + selectionToolbarInset;

  function handleComposerLayout(e: LayoutChangeEvent) {
    const next = Math.max(52, Math.round(e.nativeEvent.layout.height));
    setComposerHeight((prev) => (prev === next ? prev : next));
  }

  return (
    <View style={[styles.safe, styles.flex]}>
      {user ? (
        <DmCallSession
          threadId={threadId}
          myUserId={user.id}
          otherUserId={params.otherUserId}
          peerTitle={params.title}
          peerAvatarLetter={params.peerAvatarLetter}
          peerAvatarUrl={params.peerAvatarUrl}
          token={token}
          outgoingRequest={outgoingCall}
          onOutgoingRequestConsumed={() => setOutgoingCall(null)}
        />
      ) : null}
      <View style={[styles.flex, isWeb && styles.webRoot]}>
        <View style={[styles.chatArea, isWeb && styles.webChatArea]}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={t.bubbleOutgoing} />
            </View>
          ) : (
            <>
              {chatSearchOpen ? (
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={18} color="rgba(233,237,239,0.65)" />
                  <TextInput
                    value={chatSearchQuery}
                    onChangeText={setChatSearchQuery}
                    placeholder="Search messages"
                    placeholderTextColor="rgba(233,237,239,0.42)"
                    style={styles.searchInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                    accessibilityLabel="Search messages in this chat"
                  />
                  <Pressable
                    hitSlop={12}
                    onPress={() => {
                      setChatSearchOpen(false);
                      setChatSearchQuery('');
                    }}
                    accessibilityLabel="Close search"
                  >
                    <Ionicons name="close-circle" size={22} color="rgba(233,237,239,0.65)" />
                  </Pressable>
                </View>
              ) : null}
              <FlatList
              ref={listRef}
              style={isWeb ? styles.webList : undefined}
              data={displayedMessages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                chatSearchOpen && chatSearchQuery.trim() ? (
                  <Text style={styles.searchEmpty}>No messages match your search.</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  myUserId={user?.id}
                  peerAvatarLetter={peerLetter}
                  peerAvatarUrl={params.peerAvatarUrl}
                  selfAvatarLetter={meLetter}
                  selfAvatarUrl={user?.avatarUrl}
                  peerOnline={peerOnline}
                  isSelected={Boolean(selectedMessageIds[item.id])}
                  isPinned={Boolean(pinnedMessageIds[item.id])}
                  isStarred={Boolean(starredMessageIds[item.id])}
                  selectionMode={selectionModeActive}
                  onToggleSelect={handleToggleSelect}
                  onMessageAction={(payload) => void handleMessageAction(payload)}
                  reactionEmoji={reactionByMessageId[item.id]}
                  onReactionSelect={({ message, emoji }) => {
                    if (emoji === '+') return;
                    setReactionByMessageId((prev) => ({
                      ...prev,
                      [message.id]: prev[message.id] === emoji ? '' : emoji,
                    }));
                  }}
                />
              )}
              contentContainerStyle={[styles.listContent, { paddingBottom: listBottomInset + 12 }]}
              onContentSizeChange={scrollToEnd}
            />
            </>
          )}
        </View>
        {selectedCount > 0 ? (
          <View
            style={[styles.selectionToolbar, { bottom: composerBottom + composerHeight }]}
            accessibilityRole="toolbar"
          >
            <Pressable
              hitSlop={12}
              onPress={() => {
                setSelectedMessageIds({});
                setMultiSelectMode(false);
              }}
              style={styles.selectionToolbarHit}
            >
              <Text style={styles.selectionToolbarCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.selectionToolbarCount} numberOfLines={1}>
              {selectedCount} selected
            </Text>
            <Pressable
              hitSlop={12}
              onPress={() => {
                const ids = Object.entries(selectedMessageIds)
                  .filter(([, v]) => v)
                  .map(([k]) => k);
                promptDeleteMessages(ids);
              }}
              style={styles.selectionToolbarHit}
              accessibilityLabel="Delete selected messages"
            >
              <Ionicons name="trash-outline" size={22} color="#ff9c9c" />
            </Pressable>
          </View>
        ) : null}
        <View
          style={
            isWeb
              ? [
                  styles.composerDockWeb,
                  {
                    paddingBottom: Math.max(insets.bottom, 8) + webKeyboardInset,
                  },
                ]
              : [styles.composerDock, { bottom: composerBottom }]
          }
          onLayout={handleComposerLayout}
        >
          <Composer
            onSend={handleSend}
            onSendVoice={handleSendVoice}
            onSendPhoto={handleSendPhoto}
            onActivityChange={emitThreadActivity}
            disabled={loading}
            presetText={composerPreset?.text}
            presetToken={composerPreset?.token}
            replyPreviewText={replyPreview}
            onClearReply={() => setReplyPreview(null)}
          />
        </View>
      </View>

      <Modal
        visible={chatHeaderMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeChatHeaderMenu}
        statusBarTranslucent
      >
        <View style={chatMenuStyles.overlayRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, chatMenuStyles.overlayTint]}
            onPress={closeChatHeaderMenu}
            accessibilityLabel="Dismiss chat menu"
          />
          <View
            style={[
              chatMenuStyles.sheetWrap,
              {
                paddingTop: insets.top + NAVBAR_OFFSET_CHAT_MENU,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 8),
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={chatMenuStyles.sheet}>
              <View style={chatMenuStyles.sheetTopBar}>
                <View style={chatMenuStyles.sheetHandle} />
              </View>
              <Text style={chatMenuStyles.sheetTitle}>{params.title}</Text>
              <ScrollView style={chatMenuStyles.menuScroll} keyboardShouldPersistTaps="handled">
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={handleChatMenuViewInfo}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons name="person-circle-outline" size={22} color="#6DE8BF" />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>View info</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={handleChatMenuSearch}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons name="search-outline" size={22} color="#6DE8BF" />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>Search messages</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={handleChatMenuSelectMessages}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons name="checkbox-outline" size={22} color="#6DE8BF" />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>Select messages</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={() => void handleChatMenuMuteToggle()}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons
                      name={threadMuted ? 'notifications-outline' : 'notifications-off-outline'}
                      size={22}
                      color="#6DE8BF"
                    />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>{threadMuted ? 'Unmute notifications' : 'Mute notifications'}</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={handleChatMenuRefresh}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons name="refresh-outline" size={22} color="#6DE8BF" />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>Refresh messages</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [chatMenuStyles.menuRow, pressed && chatMenuStyles.menuRowPressed]}
                  onPress={() => void handleChatMenuCopyThreadId()}
                  android_ripple={{ color: '#ffffff14' }}
                >
                  <View style={chatMenuStyles.menuIconWrap}>
                    <Ionicons name="copy-outline" size={22} color="#6DE8BF" />
                  </View>
                  <Text style={chatMenuStyles.menuLabel}>Copy thread ID</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(233,237,239,0.45)" />
                </Pressable>
              </ScrollView>
              <Pressable style={chatMenuStyles.cancelRow} onPress={closeChatHeaderMenu}>
                <Text style={chatMenuStyles.cancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={blockingLabel != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        accessibilityViewIsModal
        accessibilityLabel="Please wait"
      >
        <View style={blockingModalStyles.backdrop} pointerEvents="auto">
          <View style={blockingModalStyles.card}>
            <ActivityIndicator size="large" color="#00A884" />
            <Text style={blockingModalStyles.text}>{blockingLabel ?? ''}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: Platform.OS === 'ios' ? 230 : 250,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#2A3A3A',
  },
  headerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#2A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    justifyContent: 'center',
    paddingVertical: 2,
    maxWidth: Platform.OS === 'ios' ? 185 : 200,
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
  subtitleActivity: {
    color: '#6DE8BF',
    textTransform: 'lowercase',
    fontWeight: '600',
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
  composerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  webRoot: {
    minHeight: 0,
  },
  webChatArea: {
    flex: 1,
    minHeight: 0,
  },
  webList: {
    flex: 1,
    minHeight: 0,
  },
  composerDockWeb: {
    flexShrink: 0,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: t.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderHairline,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: t.textOnBubble,
    paddingVertical: Platform.OS === 'ios' ? 4 : 2,
  },
  searchEmpty: {
    textAlign: 'center',
    color: 'rgba(233,237,239,0.55)',
    fontSize: 15,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  selectionToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
    backgroundColor: '#111B21',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  selectionToolbarHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 72,
  },
  selectionToolbarCancel: {
    color: '#6DE8BF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionToolbarCount: {
    flex: 1,
    textAlign: 'center',
    color: 'rgba(233,237,239,0.88)',
    fontSize: 15,
    fontWeight: '600',
    marginHorizontal: 8,
  },
});

const blockingModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    minWidth: 200,
    maxWidth: 320,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#1F2C34',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#E9EDEF',
    textAlign: 'center',
  },
});

const chatMenuStyles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  overlayTint: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    paddingHorizontal: 0,
  },
  sheet: {
    backgroundColor: '#1F2C34',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 28,
    paddingBottom: 8,
    maxHeight: '78%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetTopBar: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sheetTitle: {
    paddingHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(233,237,239,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  menuScroll: {
    maxHeight: 360,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,168,132,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#E9EDEF',
  },
  cancelRow: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(233,237,239,0.55)',
  },
});
