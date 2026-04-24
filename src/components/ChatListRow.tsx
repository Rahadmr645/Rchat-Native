import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatThread } from '../types/chat';
import { colors } from '../theme/colors';

type Props = {
  thread: ChatThread;
  onPress: () => void;
  /** When false, the green "online" avatar badge is hidden even if the server reports online. */
  deviceOnline?: boolean;
};

export function ChatListRow({ thread, onPress, deviceOnline = true }: Props) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#00000012' }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{thread.avatarLetter}</Text>
        </View>
        {thread.lastSeen === 'online' && deviceOnline ? (
          <View style={styles.onlineBadge} accessibilityLabel="Online">
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {thread.name}
          </Text>
          <Text style={[styles.time, thread.unreadCount ? styles.timeUnread : undefined]}>
            {thread.timeLabel}
          </Text>
        </View>
        {thread.lastSeen && thread.lastSeen !== 'Friends' && thread.lastSeen !== 'online' ? (
          <View style={styles.presenceRow}>
            <Text style={styles.lastSeenText} numberOfLines={1}>
              {thread.lastSeen}
            </Text>
          </View>
        ) : thread.lastSeen === 'online' && !deviceOnline ? (
          <View style={styles.presenceRow}>
            <Text style={styles.lastSeenText} numberOfLines={1}>
              Waiting for network…
            </Text>
          </View>
        ) : null}
        <View style={styles.bottomLine}>
          <Text style={styles.preview} numberOfLines={1}>
            {thread.lastMessage}
          </Text>
          {thread.unreadCount ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.listBackground,
  },
  rowPressed: {
    backgroundColor: '#F5F6F6',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DFE5E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.listBackground,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    paddingBottom: 12,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  presenceRow: {
    marginBottom: 4,
  },
  lastSeenText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeUnread: {
    color: colors.accent,
    fontWeight: '600',
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.unreadBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
