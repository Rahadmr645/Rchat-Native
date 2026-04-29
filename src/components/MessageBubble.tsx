import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { tryDecodePhotoMessage } from '../lib/photoMessageCodec';
import { tryDecodeVoiceMessage } from '../lib/voiceMessageCodec';
import type { Message } from '../types/chat';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';

type Props = {
  message: Message;
  peerAvatarLetter?: string;
  peerAvatarUrl?: string | null;
  selfAvatarLetter?: string;
  selfAvatarUrl?: string | null;
  /** When true, show a small green badge on the peer avatar (incoming side). */
  peerOnline?: boolean;
};

type SpecialMessage =
  | { kind: 'photo'; fileName: string; uri?: string; title?: string; width?: number; height?: number }
  | { kind: 'voice'; durationLabel: string; uri?: string; durationMs?: number };

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

function VoiceNotePlayer({ uri, durationLabel }: { uri?: string; durationLabel: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

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
          if (st.didJustFinish) {
            setPlaying(false);
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

  return (
    <Pressable
      onPress={() => void toggle()}
      style={styles.voiceCard}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
    >
      <View style={styles.voicePlay}>
        <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#fff" />
      </View>
      <View style={styles.voiceTrackWrap}>
        <View style={styles.voiceTrack}>
          <View style={styles.voiceBarTall} />
          <View style={styles.voiceBar} />
          <View style={styles.voiceBarSmall} />
          <View style={styles.voiceBar} />
          <View style={styles.voiceBarTall} />
          <View style={styles.voiceBarSmall} />
          <View style={styles.voiceBar} />
          <View style={styles.voiceBarTall} />
        </View>
        <Text style={styles.voiceDuration}>{durationLabel}</Text>
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
}: Props) {
  const outgoing = message.outgoing;
  const { width: winW } = useWindowDimensions();
  const special = parseSpecialMessage(message.text);
  const showDefaultMeta = special?.kind !== 'photo';

  const isWeb = Platform.OS === 'web';
  const photoWidth = isWeb ? Math.min(320, Math.max(180, Math.round(winW * 0.52))) : 220;
  const ratio =
    special?.kind === 'photo' && special.width && special.height && special.width > 0 && special.height > 0
      ? special.height / special.width
      : 1.1;
  const maxPhotoH = isWeb ? 360 : 280;
  const minPhotoH = isWeb ? 120 : 150;
  const photoHeight = Math.round(Math.max(minPhotoH, Math.min(maxPhotoH, photoWidth * ratio)));

  return (
    <View style={[styles.row, outgoing ? styles.rowOutgoing : styles.rowIncoming]}>
      {!outgoing ? (
        <Avatar letter={peerAvatarLetter} imageUri={peerAvatarUrl} onlineBadge={!!peerOnline} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View style={[styles.bubble, outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
        {special?.kind === 'photo' ? (
          <View style={[styles.photoCard, { width: photoWidth }]}>
            <View style={[styles.photoMediaWrap, { width: photoWidth, height: photoHeight }]}>
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
                {outgoing ? <Ionicons name="checkmark-done" size={14} color="#fff" style={styles.tick} /> : null}
              </View>
            </View>
            {!!special.title && special.title !== 'Photo' ? (
              <Text style={styles.photoCaption} numberOfLines={2}>
                {special.title}
              </Text>
            ) : null}
          </View>
        ) : null}

        {special?.kind === 'voice' ? (
          <VoiceNotePlayer uri={special.uri} durationLabel={special.durationLabel} />
        ) : null}

        {!special ? <Text style={styles.text}>{message.text}</Text> : null}

        {showDefaultMeta ? (
          <View style={styles.metaRow}>
            <Text style={styles.time}>{message.timeLabel}</Text>
            {outgoing ? (
              <Ionicons name="checkmark-done" size={15} color="rgba(255,255,255,0.75)" style={styles.tick} />
            ) : null}
          </View>
        ) : null}
      </View>
      {outgoing ? <Avatar letter={selfAvatarLetter} imageUri={selfAvatarUrl} /> : <View style={styles.avatarSpacer} />}
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
  },
  bubbleIncoming: {
    backgroundColor: t.bubbleIncoming,
    borderTopLeftRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: t.bubbleOutgoing,
    borderTopRightRadius: 4,
  },
  text: {
    fontSize: 15,
    color: t.textOnBubble,
    lineHeight: 21,
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
  photoCaption: {
    color: t.textOnBubble,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  voiceCard: {
    width: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  voicePlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTrackWrap: {
    flex: 1,
  },
  voiceTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 20,
    opacity: 0.75,
  },
  voiceBarTall: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  voiceBar: {
    width: 3,
    height: 10,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  voiceBarSmall: {
    width: 3,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  voiceDuration: {
    color: t.timeOnBubble,
    marginTop: 2,
    fontSize: 14,
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
  tick: {
    marginLeft: 2,
  },
});
