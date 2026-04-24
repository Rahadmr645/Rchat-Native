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

/**
 * Requests notification permission, obtains an Expo push token, and registers it with the API.
 * Requires `expo.extra.eas.projectId` (run `npx eas init` and merge into app config) for a dev/production build.
 */
export async function registerExpoPushWithServer(apiBearerToken: string): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId || typeof projectId !== 'string') {
    if (__DEV__) {
      console.warn(
        '[push] Set expo.extra.eas.projectId (run `npx eas init`) so Expo can issue a push token.',
      );
    }
    return;
  }

  let pushToken: string;
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    if (__DEV__) console.warn('[push] getExpoPushTokenAsync failed', e);
    return;
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
      return;
    }
    await writeStoredExpoPushToken(pushToken);
  } catch (e) {
    if (__DEV__) console.warn('[push] register request failed', e);
  }
}
