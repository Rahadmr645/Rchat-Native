import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getExpoNotificationPermission,
  requestExpoPushPermissionAndRegister,
  syncExpoPushWithServer,
} from '../push/expoPushRegistration';
import { useAppTheme } from '../context/ThemeContext';

type Props = {
  apiBearerToken: string;
};

export function NotificationEnableBanner({ apiBearerToken }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          backgroundColor: colors.tonalBannerBg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.divider,
        },
        inner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingBottom: 10,
        },
        iconCircle: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.cardBackground,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textCol: {
          flex: 1,
          minWidth: 0,
        },
        title: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        sub: {
          marginTop: 2,
          fontSize: 12,
          color: colors.textSecondary,
          lineHeight: 16,
        },
        cta: {
          backgroundColor: colors.header,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 10,
          flexShrink: 0,
        },
        ctaPressed: {
          opacity: 0.9,
        },
        ctaLabel: {
          color: '#fff',
          fontSize: 12,
          fontWeight: '700',
          textAlign: 'center',
        },
      }),
    [colors],
  );

  const refresh = useCallback(async () => {
    if (!Device.isDevice || Platform.OS === 'web') {
      setVisible(false);
      return;
    }
    const perm = await getExpoNotificationPermission();
    if (perm.status === 'granted') {
      setVisible(false);
      setNeedsSettings(false);
      await syncExpoPushWithServer(apiBearerToken);
      return;
    }
    const mustUseSettings = perm.status === 'denied' && perm.canAskAgain === false;
    setNeedsSettings(mustUseSettings);
    setVisible(true);
  }, [apiBearerToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onPrimaryPress = useCallback(async () => {
    if (needsSettings) {
      await Linking.openSettings();
      return;
    }
    setLoading(true);
    try {
      await requestExpoPushPermissionAndRegister(apiBearerToken);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [apiBearerToken, needsSettings, refresh]);

  if (!visible) return null;

  const title = 'Stay in the loop';
  const subtitle =
    Platform.OS === 'ios'
      ? 'Turn on notifications so you do not miss messages and calls.'
      : 'Allow notifications so you do not miss messages and calls.';
  const cta = needsSettings ? 'Open settings' : loading ? '…' : 'Allow notifications';

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Ionicons name="notifications-outline" size={22} color={colors.header} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void onPrimaryPress()}
          style={({ pressed }) => [styles.cta, pressed && !loading && styles.ctaPressed]}
        >
          <Text style={styles.ctaLabel}>{cta}</Text>
        </Pressable>
      </View>
    </View>
  );
}
