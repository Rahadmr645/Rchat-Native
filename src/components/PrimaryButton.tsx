import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';
import { colors } from '../theme/colors';

type Props = PressableProps & {
  title: string;
  loading?: boolean;
  variant?: 'solid' | 'ghost';
};

export function PrimaryButton({
  title,
  loading,
  variant = 'solid',
  disabled,
  style,
  ...rest
}: Props) {
  const isGhost = variant === 'ghost';
  const dim = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={dim}
      style={(state: PressableStateCallbackType) => {
        const { pressed } = state;
        const fromParent = typeof style === 'function' ? style(state) : style;
        return [
          styles.base,
          isGhost ? styles.ghost : styles.solid,
          dim && (isGhost ? styles.ghostDim : styles.solidDim),
          pressed && !dim && (isGhost ? styles.ghostPressed : styles.solidPressed),
          fromParent,
        ];
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.header : '#fff'} />
      ) : (
        <Text style={[styles.label, isGhost ? styles.labelGhost : styles.labelSolid]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  solid: {
    backgroundColor: colors.header,
    shadowColor: colors.headerDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  solidPressed: {
    opacity: 0.92,
  },
  solidDim: {
    opacity: 0.55,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostPressed: {
    backgroundColor: 'rgba(18, 140, 126, 0.08)',
  },
  ghostDim: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelSolid: {
    color: '#fff',
  },
  labelGhost: {
    color: colors.header,
  },
});
