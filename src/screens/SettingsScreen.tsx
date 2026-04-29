import { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useAppTheme, type ThemePreference } from '../context/ThemeContext';
import type { ChatsStackParamList } from '../navigation/types';
import { getApiBaseUrl } from '../config';
import type { ComponentProps } from 'react';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'Settings'>;

type Ion = ComponentProps<typeof Ionicons>['name'];

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  danger,
  showChevron = true,
  colors,
  rowPressedBg,
}: {
  icon: Ion;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  showChevron?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  rowPressedBg: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [layoutStyles.row, pressed && { backgroundColor: rowPressedBg }]}
      onPress={onPress}
      android_ripple={{ color: '#00000012' }}
    >
      <View
        style={[
          layoutStyles.iconWrap,
          { backgroundColor: danger ? 'rgba(192, 57, 43, 0.1)' : 'rgba(18, 140, 126, 0.1)' },
        ]}
      >
        <Ionicons name={icon} size={22} color={danger ? '#C0392B' : colors.header} />
      </View>
      <View style={layoutStyles.rowBody}>
        <Text style={[layoutStyles.rowLabel, { color: danger ? '#C0392B' : colors.textPrimary }]}>{label}</Text>
        {subtitle ? (
          <Text style={[layoutStyles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

function SectionTitle({ children, color }: { children: string; color: string }) {
  return <Text style={[styles.sectionTitleBase, { color }]}>{children}</Text>;
}

function themeSubtitle(preference: ThemePreference, resolved: 'light' | 'dark'): string {
  if (preference === 'light') return 'Light is on';
  if (preference === 'dark') return 'Dark is on';
  return `Following device (${resolved === 'dark' ? 'dark' : 'light'} now)`;
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, signOut } = useAuth();
  const { colors, preference, setPreference, resolved } = useAppTheme();

  const rowPressedBg = colors.rowPressedBackground;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: {
          flex: 1,
          backgroundColor: colors.listBackground,
        },
        content: {
          paddingTop: 12,
          paddingHorizontal: 16,
        },
        card: {
          backgroundColor: colors.cardBackground,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.divider,
          overflow: 'hidden',
        },
        hairline: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.divider,
          marginLeft: 66,
        },
        staticRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          minHeight: 52,
        },
      }),
    [colors],
  );

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'web') {
      Alert.alert('Notifications', 'Use your browser site settings to manage notifications for this page.');
      return;
    }
    void Linking.openSettings();
  }, []);

  const onSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You will need to sign in again to use RChat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  const onThemePress = useCallback(() => {
    Alert.alert('Appearance', 'Choose how RChat looks', [
      { text: 'Light', onPress: () => setPreference('light') },
      { text: 'Dark', onPress: () => setPreference('dark') },
      { text: 'Use device setting', onPress: () => setPreference('system') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [setPreference]);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? Constants.nativeBuildVersion ?? '—';
  const apiHost = (() => {
    try {
      return new URL(getApiBaseUrl()).host;
    } catch {
      return getApiBaseUrl();
    }
  })();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      {user ? (
        <>
          <SectionTitle color={colors.textSecondary}>Account</SectionTitle>
          <View style={styles.card}>
            <SettingsRow
              icon="person-circle-outline"
              label="Profile"
              subtitle="Photo, name, and email"
              onPress={() => navigation.navigate('Profile')}
              colors={colors}
              rowPressedBg={rowPressedBg}
            />
            <View style={styles.hairline} />
            <SettingsRow
              icon="person-add-outline"
              label="Friend requests"
              subtitle="Incoming and outgoing requests"
              onPress={() => navigation.navigate('AddFriend')}
              colors={colors}
              rowPressedBg={rowPressedBg}
            />
            <View style={styles.hairline} />
            <SettingsRow
              icon="search-outline"
              label="Explore people"
              subtitle="Find others on this server"
              onPress={() => navigation.navigate('ExplorePeople')}
              colors={colors}
              rowPressedBg={rowPressedBg}
            />
          </View>
        </>
      ) : null}

      <SectionTitle color={colors.textSecondary}>Appearance</SectionTitle>
      <View style={styles.card}>
        <SettingsRow
          icon="color-palette-outline"
          label="Theme"
          subtitle={themeSubtitle(preference, resolved)}
          onPress={onThemePress}
          colors={colors}
          rowPressedBg={rowPressedBg}
        />
      </View>

      <SectionTitle color={colors.textSecondary}>Notifications</SectionTitle>
      <View style={styles.card}>
        <SettingsRow
          icon="notifications-outline"
          label="System notification settings"
          subtitle={
            Platform.OS === 'web'
              ? 'Manage alerts in the browser for this site.'
              : 'Open iOS or Android settings for RChat.'
          }
          onPress={openSystemSettings}
          colors={colors}
          rowPressedBg={rowPressedBg}
        />
      </View>

      <SectionTitle color={colors.textSecondary}>About</SectionTitle>
      <View style={styles.card}>
        <View style={styles.staticRow}>
          <View style={[layoutStyles.iconWrap, { backgroundColor: 'rgba(18, 140, 126, 0.1)' }]}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.header} />
          </View>
          <View style={layoutStyles.rowBody}>
            <Text style={[layoutStyles.rowLabel, { color: colors.textPrimary }]}>App version</Text>
            <Text style={[layoutStyles.rowSubtitle, { color: colors.textSecondary }]}>{appVersion}</Text>
          </View>
        </View>
        <View style={styles.hairline} />
        <View style={styles.staticRow}>
          <View style={[layoutStyles.iconWrap, { backgroundColor: 'rgba(18, 140, 126, 0.1)' }]}>
            <Ionicons name="cloud-outline" size={22} color={colors.header} />
          </View>
          <View style={layoutStyles.rowBody}>
            <Text style={[layoutStyles.rowLabel, { color: colors.textPrimary }]}>Server</Text>
            <Text style={[layoutStyles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {apiHost}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <SettingsRow
          icon="log-out-outline"
          label="Sign out"
          onPress={onSignOut}
          danger
          showChevron={false}
          colors={colors}
          rowPressedBg={rowPressedBg}
        />
      </View>
    </ScrollView>
  );
}

const layoutStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  sectionTitleBase: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
});
