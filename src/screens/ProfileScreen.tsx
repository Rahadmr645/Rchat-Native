import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { patchMeAvatar, uploadUserAvatar } from '../network/authApi';
import { colors } from '../theme/colors';
function letterFromUser(name: string, email: string): string {
  const n = name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  const e = email?.trim();
  if (e) return e.charAt(0).toUpperCase();
  return '?';
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, setUserFromServer } = useAuth();
  const [busy, setBusy] = useState(false);

  const pickAndUpload = useCallback(async () => {
    if (!token || !user) {
      Alert.alert('Sign in required', 'You must be logged in to change your photo.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Please allow photo library access to set a profile picture.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const uri = asset.uri;
    const extFromUri = /\.(jpe?g|png|webp|heic|heif)$/i.exec(uri)?.[1]?.toLowerCase();
    const fileName = `avatar-${Date.now()}.${extFromUri === 'png' ? 'png' : extFromUri === 'webp' ? 'webp' : 'jpg'}`;
    const mimeType =
      extFromUri === 'png'
        ? 'image/png'
        : extFromUri === 'webp'
          ? 'image/webp'
          : extFromUri === 'heic' || extFromUri === 'heif'
            ? 'image/heic'
            : 'image/jpeg';

    setBusy(true);
    try {
      const { url } = await uploadUserAvatar(token, { uri, fileName, mimeType });
      const updated = await patchMeAvatar(token, url);
      setUserFromServer(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Profile photo', msg);
    } finally {
      setBusy(false);
    }
  }, [token, user, setUserFromServer]);

  const removePhoto = useCallback(() => {
    if (!token || !user) return;
    Alert.alert('Remove photo?', 'Your chats will show your initial again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void (async () => {
            try {
              const updated = await patchMeAvatar(token, null);
              setUserFromServer(updated);
            } catch (e) {
              Alert.alert('Profile', e instanceof Error ? e.message : 'Could not remove photo.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }, [token, user, setUserFromServer]);

  if (!user) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Not signed in.</Text>
      </View>
    );
  }

  const letter = letterFromUser(user.name, user.email);
  const photo = user.avatarUrl?.trim() || null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.hero}>
        <View style={styles.avatarRing}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatarImg} accessibilityLabel="Profile photo" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{letter}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator size="large" color={colors.header} />
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        onPress={() => void pickAndUpload()}
        disabled={busy}
      >
        <Ionicons name="image-outline" size={22} color="#fff" />
        <Text style={styles.primaryBtnText}>{photo ? 'Change photo' : 'Add photo'}</Text>
      </Pressable>

      {photo ? (
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          onPress={removePhoto}
          disabled={busy}
        >
          <Ionicons name="trash-outline" size={20} color="#C0392B" />
          <Text style={styles.secondaryBtnText}>Remove photo</Text>
        </Pressable>
      ) : null}

      <Text style={styles.hint}>
        Photos are uploaded to Cloudinary (same as chat images). Your friends see the update in their chat list
        after a moment.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.listBackground,
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#DFE5E7',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.header,
  },
  avatarLetter: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  email: {
    marginTop: 6,
    fontSize: 15,
    color: colors.textSecondary,
  },
  busy: {
    marginVertical: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.header,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    color: '#C0392B',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    marginTop: 24,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
  },
});
