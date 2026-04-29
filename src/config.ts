import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

export const DEFAULT_API_PORT = 3000;

/**
 * Last-resort dev host (your PC’s LAN IPv4), e.g. `192.168.1.10`.
 * Prefer `EXPO_PUBLIC_DEV_API_HOST` in `.env` for the same effect without editing code.
 */
export const DEV_API_HOST_OVERRIDE: string | null = null;

function normalizedDevHost(host: string | undefined | null): string | null {
  if (!host || typeof host !== 'string') return null;
  const stripped = host.replace(/^https?:\/\//i, '').trim();
  const h = stripped.split('/')[0]?.split(':')[0]?.trim();
  return h && h.length > 0 ? h : null;
}

function envDevApiHost(): string | null {
  if (typeof process === 'undefined' || !process.env) return null;
  return normalizedDevHost(process.env.EXPO_PUBLIC_DEV_API_HOST);
}

/** Full API origin, e.g. `https://your-app.up.railway.app` (no path). Inlined when prefixed with `EXPO_PUBLIC_`. */
function envFullApiBaseUrl(): string | null {
  if (typeof process === 'undefined' || !process.env) return null;
  const raw = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_SERVER_URL;
  if (!raw || typeof raw !== 'string') return null;
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  return u;
}

/**
 * Parses Metro / Expo URIs: `192.168.1.5:8081`, `exp://192.168.1.5:8081`, `http://…`.
 * A naive `split(':')[0]` breaks `exp://…` (returns `exp`).
 */
function hostFromUri(uri: string | undefined | null): string | null {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim().split('?')[0];
  if (!trimmed) return null;

  if (/^exp:\/\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    try {
      const normalized = trimmed.replace(/^exp:\/\//i, 'http://');
      const { hostname } = new URL(normalized);
      if (hostname) return hostname;
    } catch {
      /* fall through */
    }
  }

  const host = trimmed.split(':')[0]?.trim();
  return host && host.length > 0 ? host : null;
}

/** Metro serves the bundle from the dev machine; bare / dev client often only expose the host here. */
function hostFromMetroBundleUrl(): string | null {
  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  const m = scriptURL.match(/https?:\/\/([^/:?]+)/i);
  const host = m?.[1]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

/**
 * Dev-only: where the Node API is reachable from this device.
 * - `EXPO_PUBLIC_API_URL` (full origin) when the API is remote (e.g. Railway) — works on a physical device
 * - `EXPO_PUBLIC_DEV_API_HOST` or {@link DEV_API_HOST_OVERRIDE} when auto-detection fails
 * - Expo Go / dev client: `debuggerHost` / `hostUri`
 * - `SourceCode.scriptURL` (Metro) for many `expo run:*` setups
 * - Android emulator: 10.0.2.2
 * - Otherwise localhost (simulator / web on same machine)
 */
export function getApiBaseUrl(): string {
  const fromEnvFull = envFullApiBaseUrl();
  if (fromEnvFull) {
    return fromEnvFull;
  }

  const fromEnv = envDevApiHost();
  if (__DEV__ && fromEnv) {
    return `http://${fromEnv}:${DEFAULT_API_PORT}`;
  }

  if (!__DEV__) {
    return 'https://example.com';
  }

  if (fromEnv) {
    return `http://${fromEnv}:${DEFAULT_API_PORT}`;
  }

  const fromOverride = normalizedDevHost(DEV_API_HOST_OVERRIDE);
  if (fromOverride) {
    return `http://${fromOverride}:${DEFAULT_API_PORT}`;
  }

  const fromExpoGo = hostFromUri(
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost,
  );
  const fromExpoConfig = hostFromUri(Constants.expoConfig?.hostUri);
  const devHost = fromExpoGo ?? fromExpoConfig ?? hostFromMetroBundleUrl();

  if (devHost) {
    return `http://${devHost}:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_API_PORT}`;
  }
  return `http://localhost:${DEFAULT_API_PORT}`;
}
