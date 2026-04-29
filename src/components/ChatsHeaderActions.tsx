import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { ChatsStackParamList } from '../navigation/types';
import { useAppTheme } from '../context/ThemeContext';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatsList'>;
const NAVBAR_OFFSET = Platform.OS === 'ios' ? 52 : 56;

type IonName = ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  key: string;
  label: string;
  icon: IonName;
  onPress: () => void;
};

export function ChatsHeaderActions() {
  const navigation = useNavigation<Nav>();
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 18,
          marginRight: 4,
        },
        overlayContainer: {
          flex: 1,
          justifyContent: 'flex-start',
        },
        overlayTint: {
          backgroundColor: 'rgba(0,0,0,0.45)',
        },
        sheetWrap: {
          paddingHorizontal: 0,
          paddingBottom: 0,
        },
        sheet: {
          backgroundColor: colors.cardBackground,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          paddingTop: 28,
          paddingBottom: 8,
          maxHeight: '72%',
        },
        sheetTopBar: {
          position: 'absolute',
          top: 8,
          left: 0,
          right: 0,
          alignItems: 'center',
        },
        sheetHandle: {
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.divider,
        },
        menuList: {
          marginTop: 4,
        },
        menuRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 16,
        },
        menuRowPressed: {
          backgroundColor: colors.rowPressedBackground,
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
        menuLabel: {
          flex: 1,
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
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
      }),
    [colors],
  );

  function closeMenu() {
    setMenuOpen(false);
  }

  async function takePhoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera', 'Please allow camera access in app settings.');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (shot.canceled) return;
      Alert.alert('Camera', 'Photo captured successfully.');
    } catch (e) {
      Alert.alert('Camera', e instanceof Error ? e.message : 'Could not open camera.');
    }
  }

  async function recordVideo() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera', 'Please allow camera access in app settings.');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (shot.canceled) return;
      Alert.alert('Video', 'Video recorded successfully.');
    } catch (e) {
      Alert.alert('Video', e instanceof Error ? e.message : 'Could not start video recording.');
    }
  }

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos', 'Please allow gallery access in app settings.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (picked.canceled) return;
      Alert.alert('Photos', 'Photo selected successfully.');
    } catch (e) {
      Alert.alert('Photos', e instanceof Error ? e.message : 'Could not open photo library.');
    }
  }

  async function pickVideo() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Videos', 'Please allow gallery access in app settings.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (picked.canceled) return;
      Alert.alert('Videos', 'Video selected successfully.');
    } catch (e) {
      Alert.alert('Videos', e instanceof Error ? e.message : 'Could not open video library.');
    }
  }

  function openMediaOptions() {
    Alert.alert('Media', 'Choose an option', [
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Record video', onPress: () => void recordVideo() },
      { text: 'Choose photo', onPress: () => void pickPhoto() },
      { text: 'Choose video', onPress: () => void pickVideo() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  /** Profile, friends, sign out, etc. live on the Settings screen. */
  const items: MenuItem[] = [
    {
      key: 'settings',
      label: 'Settings',
      icon: 'settings-outline',
      onPress: () => {
        closeMenu();
        navigation.navigate('Settings');
      },
    },
  ];

  return (
    <View style={styles.row}>
      <Pressable hitSlop={10} onPress={openMediaOptions} accessibilityLabel="Media options">
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
          <View
            style={[
              styles.sheetWrap,
              {
                paddingTop: insets.top + NAVBAR_OFFSET,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 8),
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.sheet}>
              <View style={styles.sheetTopBar}>
                <View style={styles.sheetHandle} />
              </View>
              <View style={styles.menuList}>
                {items.map((item) => (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={item.onPress}
                    android_ripple={{ color: '#00000014' }}
                  >
                    <View style={styles.menuIconWrap}>
                      <Ionicons name={item.icon} size={22} color={colors.header} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </Pressable>
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
