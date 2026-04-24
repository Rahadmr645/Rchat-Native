import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import type { ChatsStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatsList'>;

type IonName = ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  key: string;
  label: string;
  icon: IonName;
  destructive?: boolean;
  onPress: () => void;
};

export function ChatsHeaderActions() {
  const navigation = useNavigation<Nav>();
  const { signOut, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  function confirmSignOut() {
    closeMenu();
    Alert.alert('Sign out?', 'You will need to sign in again to use RChat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const items: MenuItem[] = [
    {
      key: 'friend-requests',
      label: 'Friend requests',
      icon: 'person-add-outline',
      onPress: () => {
        closeMenu();
        navigation.navigate('AddFriend');
      },
    },
    {
      key: 'explore-people',
      label: 'Explore people',
      icon: 'search-outline',
      onPress: () => {
        closeMenu();
        navigation.navigate('ExplorePeople');
      },
    },
    {
      key: 'new-chat',
      label: 'New chat',
      icon: 'chatbubble-ellipses-outline',
      onPress: () => {
        closeMenu();
        Alert.alert('New chat', 'Start a chat from contacts or search when that flow is ready.');
      },
    },
    {
      key: 'new-group',
      label: 'New group',
      icon: 'people-outline',
      onPress: () => {
        closeMenu();
        Alert.alert('New group', 'Group creation can be wired here when the backend supports it.');
      },
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: 'settings-outline',
      onPress: () => {
        closeMenu();
        Alert.alert('Settings', 'App settings will live here.');
      },
    },
    {
      key: 'sign-out',
      label: 'Sign out',
      icon: 'log-out-outline',
      destructive: true,
      onPress: confirmSignOut,
    },
  ];

  return (
    <View style={styles.row}>
      <Pressable hitSlop={10} onPress={() => {}} accessibilityLabel="Camera">
        <Ionicons name="camera-outline" size={24} color="#fff" />
      </Pressable>
      <Pressable hitSlop={10} onPress={() => setMenuOpen(true)} accessibilityLabel="Open menu">
        <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.overlayContainer}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, styles.overlayTint]}
            onPress={closeMenu}
            accessibilityLabel="Dismiss menu"
          />
          <View style={styles.sheetWrap} pointerEvents="box-none">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Menu</Text>
              {user ? (
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {user.name} · {user.email}
                </Text>
              ) : null}

              <View style={styles.menuList}>
                {items.map((item, index) => (
                  <View key={item.key}>
                    {index === items.length - 1 ? <View style={styles.menuDivider} /> : null}
                    <Pressable
                      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                      onPress={item.onPress}
                      android_ripple={{ color: '#00000014' }}
                    >
                      <View
                        style={[
                          styles.menuIconWrap,
                          item.destructive ? styles.menuIconWrapDanger : undefined,
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={item.destructive ? '#C0392B' : colors.header}
                        />
                      </View>
                      <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDanger]}>
                        {item.label}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable style={styles.cancelRow} onPress={closeMenu}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginRight: 4,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayTint: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingBottom: 8,
    maxHeight: '72%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 20,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  menuList: {
    marginTop: 8,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRowPressed: {
    backgroundColor: '#F5F6F6',
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 140, 126, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuIconWrapDanger: {
    backgroundColor: 'rgba(192, 57, 43, 0.1)',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuLabelDanger: {
    color: '#C0392B',
  },
  cancelRow: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
