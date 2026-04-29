import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';

/** Inner TextInput height bounds inside the pill. */
const INPUT_MIN_H = 22;
const INPUT_MAX_H = 120;

type Props = {
  onSend: (text: string) => void;
  onSendVoice?: (payload: { uri: string; durationMs: number }) => Promise<void> | void;
  onSendPhoto?: (payload: {
    uri: string;
    fileName: string;
    width: number;
    height: number;
    mimeType?: string;
    caption?: string;
  }) => Promise<void> | void;
  disabled?: boolean;
};

function formatRecordTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? `0${sec}` : sec}`;
}

export function Composer({ onSend, onSendVoice, onSendPhoto, disabled }: Props) {
  const [value, setValue] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_H);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  const isRecording = recording != null;
  const voiceDisabled = !!disabled || voiceBusy;
  const attachDisabled = !!disabled || attachBusy;

  useEffect(() => {
    return () => {
      if (!recording) return;
      void recording.stopAndUnloadAsync().catch(() => {
        /* noop */
      });
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) {
      setRecordingMs(0);
      return;
    }
    const tick = async () => {
      try {
        const s = await recording.getStatusAsync();
        if (s.isRecording && 'durationMillis' in s && typeof s.durationMillis === 'number') {
          setRecordingMs(s.durationMillis);
        }
      } catch {
        /* noop */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 200);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  function handleSend() {
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    setInputHeight(INPUT_MIN_H);
  }

  async function startVoiceRecording() {
    if (voiceDisabled) return;
    if (!onSendVoice) {
      Alert.alert('Voice message', 'Voice sending is not available yet.');
      return;
    }
    setVoiceBusy(true);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission', 'Please allow microphone access to send voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const next = new Audio.Recording();
      await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await next.startAsync();
      setRecording(next);
    } catch {
      setRecording(null);
      Alert.alert('Voice message', 'Could not start recording.');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function cancelVoiceRecording() {
    if (!recording) return;
    setVoiceBusy(true);
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      /* noop */
    } finally {
      setRecording(null);
      setVoiceBusy(false);
    }
  }

  async function stopAndSendVoice() {
    if (!recording || !onSendVoice) return;
    setVoiceBusy(true);
    try {
      await recording.stopAndUnloadAsync();
      const status = await recording.getStatusAsync();
      const uri = recording.getURI();
      setRecording(null);
      const durationMs =
        'durationMillis' in status && typeof status.durationMillis === 'number'
          ? Math.max(0, status.durationMillis)
          : 0;
      if (!uri) {
        Alert.alert('Voice message', 'Could not read recorded audio.');
        return;
      }
      await onSendVoice({ uri, durationMs });
    } catch {
      setRecording(null);
      Alert.alert('Voice message', 'Recording failed. Please try again.');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function pickAndSendPhoto() {
    if (attachDisabled) return;
    if (!onSendPhoto) {
      Alert.alert('Photos', 'Photo sending is not available yet.');
      return;
    }
    setAttachBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos permission', 'Please allow photo library access to attach images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const caption = value.trim();
      await onSendPhoto({
        uri: asset.uri,
        fileName: asset.fileName || `photo-${Date.now()}.jpg`,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType || undefined,
        caption: caption || undefined,
      });
      if (caption) {
        setValue('');
        setInputHeight(INPUT_MIN_H);
      }
    } catch {
      Alert.alert('Photos', 'Could not attach photo. Please try again.');
    } finally {
      setAttachBusy(false);
    }
  }

  function handleAttachPlus() {
    if (attachDisabled) return;
    Alert.alert('Attach', 'Choose what to share', [
      { text: 'Photo', onPress: () => void pickAndSendPhoto() },
      {
        text: 'Location',
        onPress: () => onSend('[Location] Shared a location'),
      },
      {
        text: 'Contact',
        onPress: () => onSend('[Contact] Shared a contact card'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const hasText = value.trim().length > 0;

  if (isRecording) {
    return (
      <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
        <View style={styles.recordingBar}>
          <Pressable
            hitSlop={12}
            onPress={() => void cancelVoiceRecording()}
            disabled={voiceBusy}
            style={({ pressed }) => [styles.recordingDelete, pressed && styles.recordingDeletePressed]}
            accessibilityLabel="Delete recording"
          >
            <Ionicons name="trash-outline" size={26} color="#FF6B6B" />
          </Pressable>
          <View style={styles.recordingCenter}>
            <View style={styles.recordingTimerRow}>
              <Animated.View style={[styles.recordingDot, { opacity: pulse }]} />
              <Text style={styles.recordingTimer}>{formatRecordTimer(recordingMs)}</Text>
            </View>
            <View style={styles.slideHintRow}>
              <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.45)" />
              <Text style={styles.slideHint}>Slide to cancel</Text>
            </View>
            <View style={styles.recWave}>
              {[12, 18, 10, 22, 14, 20, 11, 16, 13].map((h, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.recWaveBar,
                    { height: h, opacity: pulse, transform: [{ scaleY: 0.85 + (i % 3) * 0.08 }] },
                  ]}
                />
              ))}
            </View>
          </View>
          <Pressable
            onPress={() => void stopAndSendVoice()}
            disabled={voiceBusy}
            style={({ pressed }) => [styles.recordingSend, pressed && styles.recordingSendPressed]}
            accessibilityLabel="Send voice message"
          >
            <Ionicons name="send" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      <View style={styles.row}>
        <View style={styles.pill}>
          <Pressable
            hitSlop={8}
            onPress={() => Alert.alert('Emoji', 'Emoji picker can plug in here.')}
            disabled={disabled}
            style={styles.pillIcon}
          >
            <Ionicons name="happy-outline" size={24} color="rgba(255,255,255,0.72)" />
          </Pressable>
          <TextInput
            style={[styles.pillInput, { height: Math.max(INPUT_MIN_H, inputHeight) }]}
            placeholder="Message"
            placeholderTextColor={t.inputPlaceholder}
            value={value}
            onChangeText={(next) => {
              setValue(next);
              if (!next) setInputHeight(INPUT_MIN_H);
            }}
            multiline
            maxLength={4000}
            editable={!disabled}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            textAlignVertical={Platform.OS === 'android' ? 'top' : undefined}
            scrollEnabled={inputHeight >= INPUT_MAX_H}
            onContentSizeChange={(e) => {
              const next = Math.round(e.nativeEvent.contentSize.height);
              setInputHeight((prev) => {
                const clamped = Math.min(INPUT_MAX_H, Math.max(INPUT_MIN_H, next));
                return clamped === prev ? prev : clamped;
              });
            }}
          />
          <Pressable
            hitSlop={8}
            onPress={() => void pickAndSendPhoto()}
            disabled={attachDisabled}
            style={styles.pillIcon}
          >
            <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.72)" />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={handleAttachPlus}
            disabled={attachDisabled}
            style={styles.pillIcon}
          >
            <Ionicons name="add-circle-outline" size={26} color="rgba(255,255,255,0.72)" />
          </Pressable>
          {hasText ? (
            <Pressable
              onPress={handleSend}
              disabled={disabled}
              style={({ pressed }) => [styles.pillIcon, pressed && styles.pillIconPressed]}
              accessibilityLabel="Send"
            >
              <Ionicons name="send" size={20} color={t.micFab} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => void startVoiceRecording()}
          disabled={voiceDisabled}
          style={({ pressed }) => [styles.micFab, pressed && styles.micFabPressed]}
          accessibilityLabel="Voice message"
        >
          <Ionicons name="mic" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: t.composerBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.borderHairline,
    paddingTop: 6,
    paddingBottom: 0,
    paddingHorizontal: 8,
  },
  wrapDisabled: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 6,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: t.inputBg,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderHairline,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 48,
    maxHeight: 164,
  },
  pillIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  pillIconPressed: {
    opacity: 0.75,
  },
  pillInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 20,
    color: t.textOnBubble,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 4,
    marginBottom: 2,
    maxHeight: INPUT_MAX_H + 20,
  },
  micFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.micFab,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  micFabPressed: {
    opacity: 0.92,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    paddingBottom: 8,
    minHeight: 56,
    backgroundColor: '#202C33',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recordingDelete: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,107,107,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDeletePressed: {
    opacity: 0.75,
  },
  recordingCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  recordingTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recordingTimer: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
  slideHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  slideHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  recWave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 22,
    marginTop: 2,
  },
  recWaveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignSelf: 'center',
  },
  recordingSend: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingSendPressed: {
    opacity: 0.88,
  },
});
