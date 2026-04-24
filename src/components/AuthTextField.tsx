import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

type Props = TextInputProps & {
  label: string;
  error?: string;
  secure?: boolean;
  showToggle?: boolean;
  onToggleSecure?: () => void;
};

export function AuthTextField({
  label,
  error,
  secure,
  showToggle,
  onToggleSecure,
  style,
  autoCapitalize = 'none',
  autoCorrect = false,
  ...rest
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <TextInput
          placeholderTextColor="#94A3B8"
          style={[styles.input, style]}
          secureTextEntry={secure}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          {...rest}
        />
        {showToggle ? (
          <Pressable
            style={styles.eyeHit}
            onPress={onToggleSecure}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={secure ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={secure ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#64748B"
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    minHeight: 52,
  },
  fieldError: {
    borderColor: '#F87171',
    backgroundColor: '#FEF2F2',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  eyeHit: {
    padding: 6,
    marginLeft: 4,
  },
  error: {
    marginTop: 6,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
});
