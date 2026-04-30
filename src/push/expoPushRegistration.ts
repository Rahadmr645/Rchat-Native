import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config';

const STORAGE_KEY = 'rchat_expo_push_token';

/** Expo Go from the store; Android remote push was removed here in SDK 53+. */
function isExpoGoClient(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

function readEasProjectId(): string | null {
  const fromExtra =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) {
    return fromExtra.trim();
  }
  const eas = Constants.easConfig as { projectId?: string } | null | undefined;
  if (eas && typeof eas.projectId === 'string' && eas.projectId.trim().length > 0) {
    return eas.projectId.trim();
  }
  return null;
}

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
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Direct messages',
      description: 'New chat messages (heads-up style alerts).',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 220, 120, 220],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      vibrationPattern: [0, 250, 150, 250],
      sound: 'default',
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
 * Requires `expo.extra.eas.projectId` (or EAS-injected id in release builds).
 * @returns true if a token was obtained and POST /api/push/register succeeded
 */
export async function syncExpoPushWithServer(apiBearerToken: string): Promise<boolean> {
  if (!Device.isDevice) return true;
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'android' && isExpoGoClient()) {
    console.warn(
      '[push] Android remote push does not run inside Expo Go (SDK 53+). Install a dev build (`npm run android` / `expo run:android` or EAS development build) so your own app binary — with Firebase — is on the device, not the Expo Go app.',
    );
    return false;
  }

  await ensureAndroidDefaultChannel();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[push] permission not granted; notifications disabled until user allows');
    return false;
  }

  const ok = await registerExpoPushTokenWithServer(apiBearerToken);
  if (!ok) {
    console.warn('[push] syncExpoPushWithServer: token not registered (see earlier [push] logs)');
  }
  return ok;
}

/**
 * Requests notification permission (system dialog when still allowed), obtains an Expo push token,
 * and registers it with the API. Call only from an explicit user action (e.g. banner button).
 */
export async function requestExpoPushPermissionAndRegister(apiBearerToken: string): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && isExpoGoClient()) {
    console.warn(
      '[push] Use a development build on Android for remote notifications (Expo Go cannot provide them since SDK 53).',
    );
    return false;
  }

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
  const projectId = readEasProjectId();
  if (!projectId) {
    console.warn(
      '[push] Missing EAS project ID — run `npx eas init`, then rebuild. Set extra.eas.projectId in app.json or EAS_PROJECT_ID for CI builds.',
    );
    return false;
  }

  const apiBase = getApiBaseUrl();
  if (!__DEV__ && (apiBase.includes('example.com') || !/^https?:\/\//i.test(apiBase))) {
    console.warn('[push] API base URL looks invalid; push register will fail:', apiBase);
  }

  let pushToken: string;
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync failed — check EAS credentials (FCM/APNs) and projectId:', e);
    return false;
  }

  try {
    const res = await fetch(`${apiBase}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiBearerToken}`,
      },
      body: JSON.stringify({ expoPushToken: pushToken }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[push] register failed HTTP', res.status, errBody.slice(0, 400));
      return false;
    }
    await writeStoredExpoPushToken(pushToken);
    return true;
  } catch (e) {
    console.warn('[push] register request failed', e);
    return false;
  }
}
