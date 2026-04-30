import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_THREADS } from '../data/mockChats';
import { fetchThreads } from '../network/chatApi';
import { getChatSocket } from '../network/chatSocket';
import { emitThreadPushMuteSync, fetchMutedThreadIdsFromStorage } from '../push/threadMuteSync';
import { ChatListRow } from '../components/ChatListRow';
import { useDeviceInternetOnline } from '../hooks/useDeviceInternetOnline';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import type { ChatsStackParamList } from '../navigation/types';
import type { ChatThread } from '../types/chat';
import { formatCallLogLine, tryParseCallLog } from '../lib/callLogCodec';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatsList'>;

function getOtherDmUserId(threadId: string, me: string): string | undefined {
  if (!threadId.startsWith('dm:')) return undefined;
  const parts = threadId.split(':');
  if (parts.length !== 3) return undefined;
  const [, a, b] = parts;
  if (a === me) return b;
  if (b === me) return a;
  return undefined;
}

export function ChatsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useAppTheme();
  const { token, user } = useAuth();
  const deviceOnline = useDeviceInternetOnline();
  const [query, setQuery] = useState('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchThreads(token);
      setThreads(data);
      setUsingFallback(false);
    } catch {
      setThreads(MOCK_THREADS);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!token) return;
    const total = threads.reduce((sum, t) => sum + (typeof t.unreadCount === 'number' ? t.unreadCount : 0), 0);
    void Notifications.setBadgeCountAsync(total);
  }, [threads, token]);

  useEffect(() => {
    if (!token) return;
    const sock = getChatSocket();
    const syncMutes = () => {
      void fetchMutedThreadIdsFromStorage().then((ids) => emitThreadPushMuteSync(sock, ids));
    };
    if (sock.connected) syncMutes();
    else sock.on('connect', syncMutes);
    return () => {
      sock.off('connect', syncMutes);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket();
    function onThreadsChanged() {
      loadThreads();
    }
    function onThreadMessage(payload?: {
      threadId?: string;
      message?: { text?: string; timeLabel?: string; senderUserId?: string | null; outgoing?: boolean };
    }) {
      const threadId = payload?.threadId;
      const message = payload?.message;
      if (!threadId || !message?.text) {
        loadThreads();
        return;
      }
      const messageText = message.text;
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === threadId);
        if (idx < 0) return prev;
        const thread = prev[idx];
        const fromMe =
          message.senderUserId != null && user?.id
            ? message.senderUserId === user.id
            : Boolean(message.outgoing);
        const callEnv = user?.id ? tryParseCallLog(messageText) : null;
        const nextLastMessage =
          callEnv != null && user?.id
            ? formatCallLogLine(user.id, callEnv)
            : fromMe
              ? `You: ${messageText}`
              : messageText;
        const nextThread: ChatThread = {
          ...thread,
          lastMessage: nextLastMessage,
          timeLabel: message.timeLabel || thread.timeLabel,
          unreadCount: fromMe ? thread.unreadCount : (thread.unreadCount ?? 0) + 1,
        };
        const next = [...prev];
        next.splice(idx, 1);
        return [nextThread, ...next];
      });
    }
    socket.on('threads_changed', onThreadsChanged);
    socket.on('thread_message', onThreadMessage);
    return () => {
      socket.off('threads_changed', onThreadsChanged);
      socket.off('thread_message', onThreadMessage);
    };
  }, [token, loadThreads, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q) ||
        (t.lastSeen && t.lastSeen.toLowerCase().includes(q)),
    );
  }, [query, threads]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: colors.listBackground,
        },
        banner: {
          backgroundColor: '#FFF4CE',
          color: '#5C4A00',
          fontSize: 13,
          paddingVertical: 8,
          paddingHorizontal: 14,
          textAlign: 'center',
        },
        searchWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 12,
          marginVertical: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: colors.searchBarBackground,
        },
        searchIcon: {
          marginRight: 8,
        },
        searchInput: {
          flex: 1,
          fontSize: 15,
          color: colors.textPrimary,
          padding: 0,
        },
        loading: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 48,
        },
        empty: {
          textAlign: 'center',
          marginTop: 40,
          color: colors.textSecondary,
          fontSize: 15,
        },
        fab: {
          position: 'absolute',
          right: 20,
          bottom: 22,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        },
        fabPressed: {
          opacity: 0.92,
        },
      }),
    [colors],
  );

  function openThread(thread: ChatThread) {
    const otherUserId = user?.id ? getOtherDmUserId(thread.id, user.id) : undefined;
    const peerLetter =
      thread.name.trim().length > 0 ? thread.name.trim().charAt(0).toUpperCase() : '?';
    navigation.navigate('ChatRoom', {
      threadId: thread.id,
      title: thread.name,
      subtitle: thread.lastSeen,
      peerAvatarLetter: peerLetter,
      peerAvatarUrl: thread.avatarUrl,
      otherUserId,
    });
  }

  return (
    <View style={styles.screen}>
      {usingFallback ? (
        <Text style={styles.banner}>Offline mode — start the server to sync chats.</Text>
      ) : null}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={12}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.header} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatListRow thread={item} deviceOnline={deviceOnline} onPress={() => openThread(item)} />
          )}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim() ? 'No chats match your search.' : 'No chats yet.'}
            </Text>
          }
        />
      )}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => navigation.navigate('AddFriend')}
        accessibilityRole="button"
        accessibilityLabel="Friend requests"
      >
        <Ionicons name="person-add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}
