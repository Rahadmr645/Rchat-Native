import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  description: string;
};

export function PlaceholderTabScreen({ title, description }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: colors.listBackground,
          padding: 24,
          justifyContent: 'center',
        },
        title: {
          fontSize: 22,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: 10,
        },
        body: {
          fontSize: 16,
          color: colors.textSecondary,
          lineHeight: 22,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>
    </SafeAreaView>
  );
}
