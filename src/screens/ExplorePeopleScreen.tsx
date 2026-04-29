import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  acceptFriendRequest,
  fetchExploreDirectory,
  FriendsApiError,
  sendFriendRequest,
  type ExploreUser,
} from '../network/friendsApi';
import { useAppTheme } from '../context/ThemeContext';
import { createExplorePeopleStyles } from './explorePeopleStyles';

export function ExplorePeopleScreen() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { colors, resolved } = useAppTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => createExplorePeopleStyles(colors, isDark), [colors, isDark]);

  const load = useCallback(async () => {
    if (!token) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { users: list } = await fetchExploreDirectory(token);
      setUsers(list);
    } catch {
      setUsers([]);
      Alert.alert('Could not load', 'Pull down to retry or check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const { users: list } = await fetchExploreDirectory(token);
      setUsers(list);
    } catch {
      Alert.alert('Could not refresh', 'Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const withoutSelf = user?.id ? users.filter((u) => u.id !== user.id) : users;
    const q = query.trim().toLowerCase();
    if (!q) return withoutSelf;
    return withoutSelf.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, query, user?.id]);

  const othersCount = useMemo(
    () => (user?.id ? users.filter((u) => u.id !== user.id).length : users.length),
    [users, user?.id],
  );

  function Avatar({ letter, imageUri }: { letter: string; imageUri?: string | null }) {
    const ch = letter.trim().slice(0, 1).toUpperCase() || '?';
    const uri = imageUri?.trim();
    return (
      <View style={styles.avatar}>
        {uri ? <Image source={{ uri }} style={styles.avatarImage} /> : <Text style={styles.avatarLetter}>{ch}</Text>}
      </View>
    );
  }

  async function onSendRequest(u: ExploreUser) {
    if (!token) return;
    setBusyKey(`send:${u.id}`);
    try {
      await sendFriendRequest(token, u.email);
      await load();
    } catch (e) {
      const msg = e instanceof FriendsApiError ? e.message : 'Could not send the request.';
      Alert.alert('Could not send', msg);
    } finally {
      setBusyKey(null);
    }
  }

  async function onAcceptIncoming(u: ExploreUser) {
    if (!token || !u.incomingRequestId) return;
    setBusyKey(`accept:${u.incomingRequestId}`);
    try {
      await acceptFriendRequest(token, u.incomingRequestId);
      await load();
    } catch (e) {
      const msg = e instanceof FriendsApiError ? e.message : 'Could not accept.';
      Alert.alert('Error', msg);
    } finally {
      setBusyKey(null);
    }
  }

  function renderRight(u: ExploreUser) {
    const anyBusy = busyKey !== null;
    if (u.relation === 'friends') {
      return (
        <View style={styles.pillMuted}>
          <Ionicons name="checkmark-done" size={16} color={colors.header} />
          <Text style={styles.pillMutedText}>Friends</Text>
        </View>
      );
    }
    if (u.relation === 'pending_out') {
      return (
        <View style={styles.pillMuted}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.pillMutedText, styles.pillSecondary]}>Sent</Text>
        </View>
      );
    }
    if (u.relation === 'pending_in' && u.incomingRequestId) {
      const key = `accept:${u.incomingRequestId}`;
      const busy = busyKey === key;
      return (
        <Pressable
          style={({ pressed }) => [styles.btnAcceptSmall, (anyBusy && !busy) && styles.btnDisabled, pressed && !busy && styles.btnAcceptSmallPressed]}
          onPress={() => onAcceptIncoming(u)}
          disabled={anyBusy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.btnAcceptSmallLabel}>Accept</Text>
            </>
          )}
        </Pressable>
      );
    }
    const key = `send:${u.id}`;
    const busy = busyKey === key;
    return (
      <Pressable
        style={({ pressed }) => [styles.btnAdd, (anyBusy && !busy) && styles.btnDisabled, pressed && !busy && styles.btnAddPressed]}
        onPress={() => onSendRequest(u)}
        disabled={anyBusy}
      >
        {busy ? (
          <ActivityIndicator color={colors.header} size="small" />
        ) : (
          <>
            <Ionicons name="person-add-outline" size={18} color={colors.header} />
            <Text style={styles.btnAddLabel}>Add</Text>
          </>
        )}
      </Pressable>
    );
  }

  if (loading && users.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.header} />
        <Text style={styles.loadingHint}>Loading people…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchShell}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.header]} tintColor={colors.header} />
        }
        contentContainerStyle={filtered.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="people-outline" size={36} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>
              {othersCount === 0 ? 'No one else yet' : 'No matches'}
            </Text>
            <Text style={styles.emptyBody}>
              {othersCount === 0
                ? 'When others sign up, they will appear here so you can connect.'
                : 'Try a different search.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar letter={item.name} imageUri={item.avatarUrl} />
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowEmail} numberOfLines={1}>
                {item.email}
              </Text>
            </View>
            {renderRight(item)}
          </View>
        )}
      />
    </View>
  );
}
