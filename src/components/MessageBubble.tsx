import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tryDecodePhotoMessage } from '../lib/photoMessageCodec';
import { tryDecodeVoiceMessage } from '../lib/voiceMessageCodec';
import type { Message } from '../types/chat';
import { DELETED_FOR_EVERYONE_MESSAGE } from '../types/chat';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';

type Props = {
  message: Message;
  peerAvatarLetter?: string;
  peerAvatarUrl?: string | null;
  selfAvatarLetter?: string;
  selfAvatarUrl?: string | null;
  /** When true, show a small green badge on the peer avatar (incoming side). */
  peerOnline?: boolean;
  onMessageAction?: (payload: { message: Message; action: MessageAction }) => void;
  onReactionSelect?: (payload: { message: Message; emoji: string }) => void;
  reactionEmoji?: string;
  isSelected?: boolean;
  isPinned?: boolean;
  isStarred?: boolean;
  /** When set, a short press toggles selection instead of doing nothing (multi-select mode). */
  selectionMode?: boolean;
  onToggleSelect?: (message: Message) => void;
};

export type MessageAction =
  | 'reply'
  | 'copy'
  | 'forward'
  | 'pin'
  | 'star'
  | 'select'
  | 'save'
  | 'share'
  | 'report'
  | 'delete';

type SpecialMessage =
  | { kind: 'photo'; fileName: string; uri?: string; title?: string; width?: number; height?: number }
  | { kind: 'voice'; durationLabel: string; uri?: string; durationMs?: number };

type ReplyEnvelope = {
  quoted: string;
  body: string;
};

function normalizeImageUri(raw: string): string {
  let u = raw.trim();
  for (let i = 0; i < 4; i++) {
    if (!/%[0-9A-Fa-f]{2}/i.test(u)) break;
    try {
      const next = decodeURIComponent(u);
      if (next === u) break;
      u = next;
    } catch {
      break;
    }
  }
  return u;
}

function formatVoiceDurationLabel(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? `0${secs}` : secs}`;
}

function parseSpecialMessage(text: string): SpecialMessage | null {
  const fromCodec = tryDecodePhotoMessage(text);
  if (fromCodec) {
    return {
      kind: 'photo',
      fileName: fromCodec.n?.trim() || 'Photo',
      uri: normalizeImageUri(fromCodec.u),
      title: fromCodec.t?.trim() || undefined,
      width: typeof fromCodec.w === 'number' ? fromCodec.w : undefined,
      height: typeof fromCodec.h === 'number' ? fromCodec.h : undefined,
    };
  }

  const voiceCodec = tryDecodeVoiceMessage(text);
  if (voiceCodec) {
    return {
      kind: 'voice',
      uri: normalizeImageUri(voiceCodec.u),
      durationMs: voiceCodec.ms,
      durationLabel: formatVoiceDurationLabel(voiceCodec.ms),
    };
  }

  const safeDecode = (v: string) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };

  if (/^(?:📷\s*)?Photo\|/i.test(text)) {
    const payload = text.replace(/^(?:📷\s*)?Photo\|/i, '');
    const fields: Record<string, string> = {};
    for (const part of payload.split('|')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim().toLowerCase();
      fields[key] = safeDecode(part.slice(idx + 1));
    }
    const uriFromRegex = text.match(/\buri=([^|\s]+)/i)?.[1];
    const titleFromRegex = text.match(/\btitle=([^|]+)$/i)?.[1];
    const widthFromRegex = text.match(/\bw=(\d+)/i)?.[1];
    const heightFromRegex = text.match(/\bh=(\d+)/i)?.[1];
    const parsedUri = normalizeImageUri(
      (fields.uri || (uriFromRegex ? safeDecode(uriFromRegex) : '')).trim(),
    );
    return {
      kind: 'photo',
      fileName: fields.name?.trim() || 'Photo',
      uri: parsedUri || undefined,
      title: fields.title?.trim() || (titleFromRegex ? safeDecode(titleFromRegex).trim() : undefined),
      width: fields.w
        ? Number.parseInt(fields.w, 10)
        : widthFromRegex
          ? Number.parseInt(widthFromRegex, 10)
          : undefined,
      height: fields.h
        ? Number.parseInt(fields.h, 10)
        : heightFromRegex
          ? Number.parseInt(heightFromRegex, 10)
          : undefined,
    };
  }

  // Safety fallback: Cloudinary (or any https image URL) in plain text
  const cloudUrl = text.match(/https?:\/\/res\.cloudinary\.com\/[^\s|"'<>]+/i)?.[0];
  if (cloudUrl) {
    return { kind: 'photo', fileName: 'Photo', uri: normalizeImageUri(cloudUrl) };
  }

  const photo = text.match(/^(?:📷\s*)?Photo:\s*(.+?)(?:\s*\((\d+)x(\d+)\))?$/i);
  if (photo) {
    return {
      kind: 'photo',
      fileName: photo[1].trim() || 'Photo',
      width: photo[2] ? Number.parseInt(photo[2], 10) : undefined,
      height: photo[3] ? Number.parseInt(photo[3], 10) : undefined,
    };
  }

  const voice = text.match(/^🎤\s*Voice message\s*\(([^)]+)\)$/i);
  if (voice) {
    return { kind: 'voice', durationLabel: voice[1].trim() || '0:00' };
  }
  return null;
}

function parseReplyEnvelope(rawText: string): ReplyEnvelope | null {
  if (!rawText.startsWith('RCHAT_REPLY|')) return null;
  const payload = rawText.slice('RCHAT_REPLY|'.length);
  const parts = payload.split('|');
  const values: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    values[part.slice(0, idx)] = part.slice(idx + 1);
  }
  if (!values.q || !values.b) return null;
  try {
    return {
      quoted: decodeURIComponent(values.q),
      body: decodeURIComponent(values.b),
    };
  } catch {
    return null;
  }
}

function VoiceNotePlayer({
  uri,
  durationLabel,
  durationMsHint,
  outgoing,
  onLongPress,
  selectionMode,
  onSelectionPress,
}: {
  uri?: string;
  durationLabel: string;
  durationMsHint?: number;
  outgoing: boolean;
  onLongPress?: (event: GestureResponderEvent) => void;
  selectionMode?: boolean;
  onSelectionPress?: () => void;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveWidth, setWaveWidth] = useState(140);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [uri]);

  async function toggle() {
    if (!uri) {
      Alert.alert(
        'Voice message',
        'This message has no audio file. Ask the sender to record again after updating the app.',
      );
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          setPlaying(st.isPlaying);
          const resolvedDuration =
            typeof st.durationMillis === 'number' && st.durationMillis > 0
              ? st.durationMillis
              : Math.max(0, durationMsHint ?? 0);
          const nextElapsed = Math.max(0, st.positionMillis ?? 0);
          setElapsedMs(nextElapsed);
          setProgress(
            resolvedDuration > 0 ? Math.max(0, Math.min(1, nextElapsed / resolvedDuration)) : 0,
          );
          if (st.didJustFinish) {
            setPlaying(false);
            setElapsedMs(0);
            setProgress(0);
            void sound.setPositionAsync(0);
          }
        });
      }
      const st = await soundRef.current.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        const atEnd =
          st.durationMillis != null &&
          st.positionMillis != null &&
          st.durationMillis > 0 &&
          st.positionMillis >= st.durationMillis - 80;
        if (atEnd) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch {
      Alert.alert('Playback', 'Could not play this voice note.');
      setPlaying(false);
    }
  }

  const totalMs = Math.max(0, durationMsHint ?? 0);
  const elapsedLabel = formatVoiceDurationLabel(Math.min(totalMs || elapsedMs, elapsedMs));
  const activeLabel = playing && totalMs > 0 ? elapsedLabel : durationLabel;
  const basePattern = [6, 8, 11, 9, 13, 8, 10, 12, 8, 7, 9, 13];
  const barCount = Math.max(14, Math.min(30, Math.floor((waveWidth - 10) / 4)));
  const playedBars = Math.floor(progress * barCount);

  return (
    <Pressable
      onPress={() => {
        if (selectionMode && onSelectionPress) {
          onSelectionPress();
          return;
        }
        void toggle();
      }}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={[styles.voiceCard, outgoing ? styles.voiceCardOutgoing : styles.voiceCardIncoming, playing && styles.voiceCardPlaying]}
      accessibilityRole="button"
      accessibilityLabel={
        selectionMode ? 'Toggle message selection' : playing ? 'Pause voice message' : 'Play voice message'
      }
    >
      <View style={[styles.voicePlay, outgoing ? styles.voicePlayOutgoing : styles.voicePlayIncoming]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={outgoing ? '#DDF6EA' : '#78C4F9'} />
      </View>
      <View style={styles.voiceWaveWrap}>
        <View
          style={[styles.voiceTrack, outgoing ? styles.voiceTrackOutgoing : styles.voiceTrackIncoming]}
          onLayout={(e) => setWaveWidth(Math.max(80, Math.round(e.nativeEvent.layout.width)))}
        >
          <View style={styles.voiceProgressDot} />
          {Array.from({ length: barCount }, (_, idx) => {
            const h = basePattern[idx % basePattern.length];
            const isPlayed = idx <= playedBars;
            return (
              <View
                key={`bar-${idx}`}
                style={[
                  styles.voiceBar,
                  { height: h, opacity: isPlayed ? 0.98 : 0.38 },
                  isPlayed
                    ? outgoing
                      ? styles.voiceBarPlayedOutgoing
                      : styles.voiceBarPlayedIncoming
                    : outgoing
                      ? styles.voiceBarIdleOutgoing
                      : styles.voiceBarIdleIncoming,
                ]}
              />
            );
          })}
        </View>
        <Text style={styles.voiceDuration}>{activeLabel}</Text>
      </View>
    </Pressable>
  );
}

function Avatar({
  letter,
  imageUri,
  onlineBadge,
}: {
  letter: string;
  imageUri?: string | null;
  onlineBadge?: boolean;
}) {
  const ch = letter.trim().slice(0, 1).toUpperCase() || '?';
  const uri = imageUri?.trim();
  return (
    <View style={styles.avatarWrap}>
      <View style={styles.avatar}>
        {uri ? (
          <Image source={{ uri }} style={styles.avatarImage} accessibilityLabel="Avatar" />
        ) : (
          <Text style={styles.avatarText}>{ch}</Text>
        )}
      </View>
      {onlineBadge ? (
        <View style={styles.onlineBadge}>
          <Ionicons name="checkmark" size={10} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

export function MessageBubble({
  message,
  peerAvatarLetter = '?',
  peerAvatarUrl,
  selfAvatarLetter = 'Y',
  selfAvatarUrl,
  peerOnline,
  onMessageAction,
  onReactionSelect,
  reactionEmoji,
  isSelected = false,
  isPinned = false,
  isStarred = false,
  selectionMode = false,
  onToggleSelect,
}: Props) {
  const outgoing = message.outgoing;
  const isRevoked =
    Boolean(message.isDeletedForEveryone) || message.text === DELETED_FOR_EVERYONE_MESSAGE;
  const readBadgeAnim = useRef(new Animated.Value(message.sending ? 0.9 : 1)).current;
  const showStatusBadge = outgoing && !isRevoked;
  const isPending = outgoing && Boolean(message.sending);
  const deliveryStatus = message.deliveryStatus ?? (message.seenByOther ? 'seen' : 'sent');
  const isDelivered = outgoing && !message.sending && deliveryStatus === 'delivered';
  const isSent = outgoing && !message.sending && deliveryStatus === 'sent';
  const isSeen = outgoing && !message.sending && (deliveryStatus === 'seen' || message.seenByOther === true);
  // IMO-style colours: idle ticks are a soft grey, "seen" flips to a vibrant
  // teal so the read receipt is unmistakable.
  const tickIdleColor = 'rgba(233,237,239,0.78)';
  const tickSeenColor = '#53BDEB';
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const replyEnvelope = parseReplyEnvelope(message.text);
  const bodyText = replyEnvelope?.body ?? message.text;
  const special = parseSpecialMessage(bodyText);
  const showDefaultMeta = special?.kind !== 'photo';
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: winW / 2, y: winH / 2 });

  const isWeb = Platform.OS === 'web';
  const isMobile = !isWeb;
  const mobilePhotoRingWrapStyle = isMobile
    ? { minWidth: 18, height: 16, borderRadius: 4, paddingHorizontal: 2 }
    : null;
  const photoWidth = isWeb ? Math.min(320, Math.max(180, Math.round(winW * 0.52))) : 220;
  const ratio =
    special?.kind === 'photo' && special.width && special.height && special.width > 0 && special.height > 0
      ? special.height / special.width
      : 1.1;
  const maxPhotoH = isWeb ? 360 : 280;
  const minPhotoH = isWeb ? 120 : 150;
  const photoHeight = Math.round(Math.max(minPhotoH, Math.min(maxPhotoH, photoWidth * ratio)));
  const screenPadding = 12;
  const reactionBarHeight = 42;
  const reactionGap = 8;
  const reactionStack = reactionBarHeight + reactionGap;
  const menuWidth = Math.min(320, Math.max(250, winW - insets.left - insets.right - screenPadding * 2));
  const padX = Math.max(screenPadding, insets.left + 8);
  const padRight = Math.max(screenPadding, insets.right + 8);
  const menuLeft = Math.max(padX, Math.min(winW - menuWidth - padRight, menuAnchor.x - menuWidth / 2));

  // Safe vertical band (notch + home indicator); keep reaction strip + menu fully on screen.
  const safeTop = insets.top + screenPadding;
  const safeBottom = winH - insets.bottom - screenPadding;
  const usableH = Math.max(100, safeBottom - safeTop);
  const menuHeight = Math.min(340, Math.max(80, usableH - reactionStack - 8));
  const stackH = reactionStack + menuHeight;
  const anchorY = menuAnchor.y;
  let reactionsTop = anchorY + 8;
  reactionsTop = Math.min(reactionsTop, safeBottom - stackH);
  reactionsTop = Math.max(safeTop, reactionsTop);
  const menuTop = reactionsTop + reactionBarHeight + reactionGap;
  const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '+'];
  const menuItems = useMemo(
    () => [
      { key: 'reply' as const, icon: 'return-up-back-outline' as const, label: 'Reply' },
      { key: 'copy' as const, icon: 'copy-outline' as const, label: 'Copy' },
      { key: 'forward' as const, icon: 'arrow-redo-outline' as const, label: 'Forward' },
      { key: 'pin' as const, icon: 'attach-outline' as const, label: 'Pin' },
      { key: 'star' as const, icon: 'star-outline' as const, label: 'Star' },
      { key: 'select' as const, icon: 'checkmark-circle-outline' as const, label: 'Select' },
      { key: 'save' as const, icon: 'download-outline' as const, label: 'Save as' },
      { key: 'share' as const, icon: 'share-social-outline' as const, label: 'Share' },
      { key: 'report' as const, icon: 'alert-circle-outline' as const, label: 'Report' },
      { key: 'delete' as const, icon: 'trash-outline' as const, label: 'Delete' },
    ],
    [],
  );

  useEffect(() => {
    Animated.spring(readBadgeAnim, {
      toValue: showStatusBadge ? 1 : 0.9,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [showStatusBadge, readBadgeAnim]);

  function openContextMenu(event: GestureResponderEvent) {
    const { pageY } = event.nativeEvent;
    // Keep menu neutral so it works the same for left/right messages.
    setMenuAnchor({ x: winW / 2, y: pageY });
    setMenuVisible(true);
  }

  function runAction(action: MessageAction) {
    setMenuVisible(false);
    onMessageAction?.({ message, action });
  }

  return (
    <View style={[styles.row, outgoing ? styles.rowOutgoing : styles.rowIncoming]}>
      {!outgoing ? (
        <Avatar letter={peerAvatarLetter} imageUri={peerAvatarUrl} onlineBadge={!!peerOnline} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <Pressable
        style={[
          styles.bubble,
          outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
          isSelected && styles.bubbleSelected,
        ]}
        onPress={() => {
          if (selectionMode) onToggleSelect?.(message);
        }}
        onLongPress={openContextMenu}
        delayLongPress={220}
      >
        {special?.kind === 'photo' ? (
          <Pressable
            style={[styles.photoCard, { width: photoWidth }]}
            onPress={() => {
              if (selectionMode) onToggleSelect?.(message);
            }}
            onLongPress={openContextMenu}
            delayLongPress={220}
          >
            <View style={[styles.photoMediaWrap, { width: photoWidth, height: photoHeight }]} pointerEvents="none">
              {special.uri ? (
                <Image
                  key={`${message.id}-${special.uri}`}
                  source={{ uri: special.uri }}
                  style={styles.photoMedia}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoFallback}>
                  <Ionicons name="image-outline" size={34} color="rgba(255,255,255,0.9)" />
                </View>
              )}
              <View style={styles.photoOverlayMeta}>
                <Text style={styles.photoOverlayTime}>{message.timeLabel}</Text>
                {showStatusBadge ? (
                  <View style={[styles.photoTickWrap, mobilePhotoRingWrapStyle]}>
                    {isPending ? (
                      <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.92)" />
                    ) : isSeen ? (
                      <View style={styles.photoSeenRing} />
                    ) : isDelivered ? (
                      <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.92)" />
                    ) : isSent ? (
                      <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.92)" />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
            {!!special.title && special.title !== 'Photo' ? (
              <Text style={styles.photoCaption} numberOfLines={2}>
                {special.title}
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {special?.kind === 'voice' ? (
          <VoiceNotePlayer
            uri={special.uri}
            durationLabel={special.durationLabel}
            durationMsHint={special.durationMs}
            outgoing={outgoing}
            onLongPress={openContextMenu}
            selectionMode={selectionMode}
            onSelectionPress={() => onToggleSelect?.(message)}
          />
        ) : null}

        {replyEnvelope ? (
          <View style={styles.replyQuoteBox}>
            <View style={styles.replyQuoteAccent} />
            <Text style={styles.replyQuoteText} numberOfLines={2}>
              {replyEnvelope.quoted}
            </Text>
          </View>
        ) : null}

        {!special ? (
          <Text style={[styles.text, isRevoked && styles.textRevoked]}>{bodyText}</Text>
        ) : null}

        {showDefaultMeta ? (
          <View style={styles.metaRow}>
            {isPinned ? <Ionicons name="attach" size={12} color="rgba(255,255,255,0.72)" /> : null}
            {isStarred ? <Ionicons name="star" size={12} color="#FFD569" /> : null}
            <Text style={styles.time}>{message.timeLabel}</Text>
            {showStatusBadge ? (
              <Animated.View
                style={[
                  styles.tickWrap,
                  {
                    opacity: readBadgeAnim,
                    transform: [{ scale: readBadgeAnim }],
                  },
                ]}
              >
                {isPending ? (
                  <Ionicons name="time-outline" size={14} color={tickIdleColor} />
                ) : isSeen ? (
                  <View style={styles.seenRing} />
                ) : isDelivered ? (
                  <Ionicons name="checkmark-done" size={15} color={tickIdleColor} />
                ) : isSent ? (
                  <Ionicons name="checkmark" size={14} color={tickIdleColor} />
                ) : null}
              </Animated.View>
            ) : null}
          </View>
        ) : null}
        {reactionEmoji ? (
          <View
            style={[
              styles.attachedReaction,
              outgoing ? styles.attachedReactionOutgoing : styles.attachedReactionIncoming,
            ]}
          >
            <Text style={styles.attachedReactionText}>{reactionEmoji}</Text>
          </View>
        ) : null}
      </Pressable>
      {outgoing ? <Avatar letter={selfAvatarLetter} imageUri={selfAvatarUrl} /> : <View style={styles.avatarSpacer} />}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuVisible(false)} />
          <View style={[styles.reactionsRow, { top: reactionsTop, left: menuLeft, width: menuWidth }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionsScroll}>
              {reactions.map((emoji) => (
                <Pressable
                  key={`${message.id}-${emoji}`}
                  onPress={() => {
                    setMenuVisible(false);
                  onReactionSelect?.({ message, emoji });
                  }}
                  style={styles.reactionChip}
                >
                  <Text style={styles.reactionText}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={[styles.menuCard, { top: menuTop, left: menuLeft, width: menuWidth, height: menuHeight }]}>
            <ScrollView
              style={styles.menuScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={styles.menuScrollContent}
            >
              {menuItems.map((item) => (
                <Pressable key={item.key} style={styles.menuItem} onPress={() => runAction(item.key)}>
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={item.key === 'delete' ? '#ff7c7c' : item.key === 'report' ? '#ffd77b' : '#E9EDEF'}
                  />
                  <Text
                    style={[
                      styles.menuLabel,
                      item.key === 'delete' && styles.menuLabelDelete,
                      item.key === 'report' && styles.menuLabelReport,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  rowIncoming: {
    justifyContent: 'flex-start',
  },
  rowOutgoing: {
    justifyContent: 'flex-end',
  },
  avatarSpacer: {
    width: 36,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    position: 'relative',
  },
  onlineBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.screenBg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: t.avatarLetter,
  },
  bubble: {
    maxWidth: '76%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    position: 'relative',
  },
  bubbleIncoming: {
    backgroundColor: t.bubbleIncoming,
    borderTopLeftRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: t.bubbleOutgoing,
    borderTopRightRadius: 4,
  },
  bubbleSelected: {
    borderWidth: 1,
    borderColor: 'rgba(0,168,132,0.88)',
  },
  text: {
    fontSize: 15,
    color: t.textOnBubble,
    lineHeight: 21,
  },
  textRevoked: {
    fontStyle: 'italic',
    color: 'rgba(233,237,239,0.58)',
  },
  replyQuoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 6,
    gap: 8,
  },
  replyQuoteAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#6DE8BF',
  },
  replyQuoteText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(233,237,239,0.92)',
    fontSize: 12,
    lineHeight: 16,
  },
  photoCard: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  photoMediaWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
  },
  photoMedia: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  photoOverlayMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  photoOverlayTime: {
    color: '#fff',
    fontSize: 11,
  },
  photoTickWrap: {
    minWidth: 16,
    height: 14,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSeenRing: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 2,
    borderColor: '#53BDEB',
    backgroundColor: 'transparent',
  },
  photoCaption: {
    color: t.textOnBubble,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  voiceCard: {
    minWidth: 170,
    maxWidth: 245,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  voiceCardPlaying: {
    opacity: 0.95,
  },
  voiceCardOutgoing: {
    paddingRight: 4,
  },
  voiceCardIncoming: {
    paddingRight: 0,
  },
  voicePlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayOutgoing: {
    backgroundColor: 'rgba(9, 30, 22, 0.56)',
  },
  voicePlayIncoming: {
    backgroundColor: 'rgba(18, 42, 57, 0.6)',
  },
  voiceWaveWrap: {
    flex: 1,
    minWidth: 0,
  },
  voiceTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    borderRadius: 8,
    gap: 2,
    paddingHorizontal: 3,
  },
  voiceTrackOutgoing: {
    backgroundColor: 'rgba(7, 26, 19, 0.25)',
  },
  voiceTrackIncoming: {
    backgroundColor: 'rgba(16, 38, 51, 0.25)',
  },
  voiceProgressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#57B9F6',
    marginRight: 1,
  },
  voiceBar: {
    width: 2,
    borderRadius: 2,
  },
  voiceBarIdleOutgoing: {
    backgroundColor: 'rgba(203, 231, 216, 0.42)',
  },
  voiceBarIdleIncoming: {
    backgroundColor: 'rgba(212, 226, 236, 0.4)',
  },
  voiceBarPlayedOutgoing: {
    backgroundColor: 'rgba(229, 247, 237, 0.98)',
  },
  voiceBarPlayedIncoming: {
    backgroundColor: 'rgba(236, 244, 250, 0.98)',
  },
  voiceDuration: {
    color: 'rgba(233,237,239,0.78)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    minWidth: 26,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: t.timeOnBubble,
  },
  tickWrap: {
    marginLeft: 2,
    minWidth: 16,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  seenRing: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.2,
    borderColor: '#53BDEB',
    backgroundColor: 'transparent',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reactionsRow: {
    position: 'absolute',
    zIndex: 2,
    height: 42,
    backgroundColor: '#1F2C34',
    borderRadius: 22,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reactionsScroll: {
    alignItems: 'center',
    paddingRight: 6,
  },
  reactionChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 18,
  },
  menuCard: {
    position: 'absolute',
    zIndex: 1,
    backgroundColor: '#1F2C34',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    paddingVertical: 8,
  },
  menuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuLabel: {
    color: '#E9EDEF',
    fontSize: 16,
    fontWeight: '500',
  },
  menuLabelReport: {
    color: '#ffd77b',
  },
  menuLabelDelete: {
    color: '#ff7c7c',
  },
  attachedReaction: {
    position: 'absolute',
    bottom: -12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2C34',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  attachedReactionIncoming: {
    left: 8,
  },
  attachedReactionOutgoing: {
    right: 8,
  },
  attachedReactionText: {
    fontSize: 14,
  },
});
