import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatThread } from '../types/chat';
import { tryDecodeVoiceMessage } from '../lib/voiceMessageCodec';
import { useAppTheme } from '../context/ThemeContext';

type Props = {
  thread: ChatThread;
  onPress: () => void;
  /** When false, the green "online" avatar badge is hidden even if the server reports online. */
  deviceOnline?: boolean;
};

function formatVoiceDurationLabel(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? `0${secs}` : secs}`;
}

function unwrapMePrefix(text: string): { hasMePrefix: boolean; raw: string } {
  const mePrefix = 'You: ';
  const hasMePrefix = text.startsWith(mePrefix);
  return { hasMePrefix, raw: hasMePrefix ? text.slice(mePrefix.length) : text };
}

function getThreadPreview(text: string): string {
  const mePrefix = 'You: ';
  const { hasMePrefix, raw } = unwrapMePrefix(text);

  if (raw.startsWith('RCHAT_REPLY|')) {
    const payload = raw.slice('RCHAT_REPLY|'.length);
    const fields: Record<string, string> = {};
    for (const part of payload.split('|')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      fields[part.slice(0, idx)] = part.slice(idx + 1);
    }
    if (fields.b) {
      try {
        const body = decodeURIComponent(fields.b).trim();
        if (body) return hasMePrefix ? `${mePrefix}${body}` : body;
      } catch {
        // Fall back to default handling for malformed payloads.
      }
    }
  }

  const voice = tryDecodeVoiceMessage(raw);
  if (voice) {
    const label = `Voice message (${formatVoiceDurationLabel(voice.ms)})`;
    return hasMePrefix ? `${mePrefix}${label}` : label;
  }
  return text;
}

export function ChatListRow({ thread, onPress, deviceOnline = true }: Props) {
  const { colors, resolved } = useAppTheme();
  const ripple = resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#00000012';
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.listBackground,
        },
        rowPressed: {
          backgroundColor: colors.rowPressedBackground,
        },
        avatarWrap: {
          position: 'relative',
          marginRight: 14,
        },
        avatar: {
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.listAvatarPlaceholderBg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        avatarImage: {
          width: '100%',
          height: '100%',
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
        voiceInline: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          marginRight: 8,
        },
        voiceInlineDuration: {
          fontSize: 14,
          color: colors.textSecondary,
          fontVariant: ['tabular-nums'],
        },
        voicePrefix: {
          fontSize: 14,
          color: colors.textSecondary,
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
      }),
    [colors],
  );

  const { hasMePrefix, raw } = unwrapMePrefix(thread.lastMessage);
  const voicePreview = tryDecodeVoiceMessage(raw);
  const previewText = getThreadPreview(thread.lastMessage);

  return (
    <Pressable onPress={onPress} android_ripple={{ color: ripple }} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {thread.avatarUrl ? (
            <Image source={{ uri: thread.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{thread.avatarLetter}</Text>
          )}
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
          <Text style={[styles.time, thread.unreadCount ? styles.timeUnread : undefined]}>{thread.timeLabel}</Text>
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
          {voicePreview ? (
            <View style={styles.voiceInline}>
              <Ionicons name="mic" size={13} color={colors.textSecondary} />
              {hasMePrefix ? <Text style={styles.voicePrefix}>You: </Text> : null}
              <Text style={styles.voiceInlineDuration} numberOfLines={1}>
                {formatVoiceDurationLabel(voicePreview.ms)}
              </Text>
            </View>
          ) : (
            <Text style={styles.preview} numberOfLines={1}>
              {previewText}
            </Text>
          )}
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
