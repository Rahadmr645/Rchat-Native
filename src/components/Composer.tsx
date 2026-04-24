import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';

/** Inner TextInput height bounds inside the pill. */
const INPUT_MIN_H = 22;
const INPUT_MAX_H = 88;

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_H);

  function handleSend() {
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    setInputHeight(INPUT_MIN_H);
  }

  const hasText = value.trim().length > 0;

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
            onPress={() => Alert.alert('Photos', 'Gallery attach flow can go here.')}
            disabled={disabled}
            style={styles.pillIcon}
          >
            <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.72)" />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => Alert.alert('Attach', 'More attachment types when ready.')}
            disabled={disabled}
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
          onPress={() => Alert.alert('Voice message', 'Voice recording can be added here.')}
          disabled={disabled}
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
    maxHeight: 132,
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
});
