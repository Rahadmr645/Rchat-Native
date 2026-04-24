import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config';

const STORAGE_KEY = 'rchat_expo_push_token';

async function readStoredExpoPushToken(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(STORAGE_KEY);
    return t && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

async function writeStoredExpoPushToken(token: string | null): Promise<void> {
  if (!token) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, token);
}

async function ensureAndroidDefaultChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/**
 * Removes this device token from the server (call while the API JWT is still valid).
 */
export async function unregisterExpoPushFromServer(apiBearerToken: string): Promise<void> {
  const expoToken = await readStoredExpoPushToken();
  if (!expoToken) return;
  try {
    await fetch(`${getApiBaseUrl()}/api/push/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiBearerToken}`,
      },
      body: JSON.stringify({ expoPushToken: expoToken }),
    });
  } catch {
    /* ignore network errors on sign-out */
  } finally {
    await writeStoredExpoPushToken(null);
  }
}

export function getExpoNotificationPermission(): Promise<Notifications.PermissionResponse> {
  return Notifications.getPermissionsAsync();
}

/**
 * Registers with the server when notification permission is already granted.
 * Does not show a permission dialog (safe to call on sign-in / app start).
 * Requires `expo.extra.eas.projectId` for a dev/production build.
 */
export async function syncExpoPushWithServer(apiBearerToken: string): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'web') return;

  await ensureAndroidDefaultChannel();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const ok = await registerExpoPushTokenWithServer(apiBearerToken);
  if (!ok && __DEV__) console.warn('[push] sync register did not complete');
}

/**
 * Requests notification permission (system dialog when still allowed), obtains an Expo push token,
 * and registers it with the API. Call only from an explicit user action (e.g. banner button).
 */
export async function requestExpoPushPermissionAndRegister(apiBearerToken: string): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'web') return false;

  await ensureAndroidDefaultChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return false;

  return registerExpoPushTokenWithServer(apiBearerToken);
}

async function registerExpoPushTokenWithServer(apiBearerToken: string): Promise<boolean> {
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId || typeof projectId !== 'string') {
    if (__DEV__) {
      console.warn(
        '[push] Set expo.extra.eas.projectId (run `npx eas init`) so Expo can issue a push token.',
      );
    }
    return false;
  }

  let pushToken: string;
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    if (__DEV__) console.warn('[push] getExpoPushTokenAsync failed', e);
    return false;
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiBearerToken}`,
      },
      body: JSON.stringify({ expoPushToken: pushToken }),
    });
    if (!res.ok) {
      if (__DEV__) console.warn('[push] register failed HTTP', res.status);
      return false;
    }
    await writeStoredExpoPushToken(pushToken);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[push] register request failed', e);
    return false;
  }
}
