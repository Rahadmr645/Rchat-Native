import { useCallback, type ComponentProps } from 'react';
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
import type { ChatsStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { getApiBaseUrl } from '../config';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'Settings'>;

type Ion = ComponentProps<typeof Ionicons>['name'];

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  danger,
  showChevron = true,
}: {
  icon: Ion;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  showChevron?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      android_ripple={{ color: '#00000012' }}
    >
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Ionicons name={icon} size={22} color={danger ? '#C0392B' : colors.header} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, signOut } = useAuth();

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
          <SectionTitle>Account</SectionTitle>
          <View style={styles.card}>
            <SettingsRow
              icon="person-circle-outline"
              label="Profile"
              subtitle="Photo, name, and email"
              onPress={() => navigation.navigate('Profile')}
            />
            <View style={styles.hairline} />
            <SettingsRow
              icon="person-add-outline"
              label="Friend requests"
              subtitle="Incoming and outgoing requests"
              onPress={() => navigation.navigate('AddFriend')}
            />
            <View style={styles.hairline} />
            <SettingsRow
              icon="search-outline"
              label="Explore people"
              subtitle="Find others on this server"
              onPress={() => navigation.navigate('ExplorePeople')}
            />
          </View>
        </>
      ) : null}

      <SectionTitle>Notifications</SectionTitle>
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
        />
      </View>

      <SectionTitle>About</SectionTitle>
      <View style={styles.card}>
        <View style={styles.staticRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.header} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>App version</Text>
            <Text style={styles.rowSubtitle}>{appVersion}</Text>
          </View>
        </View>
        <View style={styles.hairline} />
        <View style={styles.staticRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-outline" size={22} color={colors.header} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Server</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
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
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.listBackground,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  rowPressed: {
    backgroundColor: '#F5F6F6',
  },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 140, 126, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapDanger: {
    backgroundColor: 'rgba(192, 57, 43, 0.1)',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowLabelDanger: {
    color: '#C0392B',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 66,
  },
});
