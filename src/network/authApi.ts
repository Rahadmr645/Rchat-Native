import { Platform } from 'react-native';
import { DEFAULT_API_PORT, getApiBaseUrl } from '../config';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  /** HTTPS URL from Cloudinary (or null if unset). */
  avatarUrl?: string | null;
};

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function readBody(res: Response): Promise<{ error?: string } | unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function isLocalApiUrl(apiBaseUrl: string): boolean {
  try {
    const u = new URL(apiBaseUrl);
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '10.0.2.2') return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

async function postJson(url: string, body: object): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const apiBaseUrl = getApiBaseUrl();
    const hint =
      e instanceof TypeError
        ? isLocalApiUrl(apiBaseUrl)
          ? `Cannot reach the server at ${apiBaseUrl}. Start the API (${DEFAULT_API_PORT}), use the same Wi‑Fi as your phone, and try again. For local dev on a device, set EXPO_PUBLIC_DEV_API_HOST (your PC’s LAN IP) or DEV_API_HOST_OVERRIDE in src/config.ts.`
          : `Cannot reach the remote server at ${apiBaseUrl}. The host may be down, blocked by network/VPN, or returning 502. Open ${apiBaseUrl}/health in your browser and check Railway logs.`
        : 'Network error. Check your connection and try again.';
    throw new AuthApiError(hint, 'network', 0);
  }
}

async function getWithAuth(url: string, token: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    const apiBaseUrl = getApiBaseUrl();
    const hint =
      e instanceof TypeError
        ? isLocalApiUrl(apiBaseUrl)
          ? `Cannot reach the server at ${apiBaseUrl}. Check Wi‑Fi and that the server is running.`
          : `Cannot reach the remote server at ${apiBaseUrl}. Check Railway status/logs and your network, then try again.`
        : 'Network error. Check your connection and try again.';
    throw new AuthApiError(hint, 'network', 0);
  }
}

export async function registerAccount(
  email: string,
  password: string,
  name?: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await postJson(`${getApiBaseUrl()}/api/auth/register`, {
    email,
    password,
    name: name?.trim() || undefined,
  });
  const body = (await readBody(res)) as { error?: string; user?: AuthUser; token?: string };
  if (!res.ok) {
    throw new AuthApiError(
      mapAuthError(body?.error, res.status),
      body?.error ?? 'unknown',
      res.status,
    );
  }
  if (!body.user || !body.token) {
    throw new AuthApiError('Unexpected server response', 'bad_response', res.status);
  }
  return { user: body.user, token: body.token };
}

export async function loginAccount(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await postJson(`${getApiBaseUrl()}/api/auth/login`, { email, password });
  const body = (await readBody(res)) as { error?: string; user?: AuthUser; token?: string };
  if (!res.ok) {
    throw new AuthApiError(
      mapAuthError(body?.error, res.status),
      body?.error ?? 'unknown',
      res.status,
    );
  }
  if (!body.user || !body.token) {
    throw new AuthApiError('Unexpected server response', 'bad_response', res.status);
  }
  return { user: body.user, token: body.token };
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await getWithAuth(`${getApiBaseUrl()}/api/auth/me`, token);
  const body = (await readBody(res)) as { error?: string; user?: AuthUser };
  if (!res.ok) {
    throw new AuthApiError(
      mapAuthError(body?.error, res.status),
      body?.error ?? 'unknown',
      res.status,
    );
  }
  if (!body.user) {
    throw new AuthApiError('Unexpected server response', 'bad_response', res.status);
  }
  return body.user;
}

export async function patchMeAvatar(token: string, avatarUrl: string | null): Promise<AuthUser> {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl }),
  });
  const body = (await readBody(res)) as { error?: string; user?: AuthUser };
  if (!res.ok) {
    throw new AuthApiError(
      mapAuthError(body?.error, res.status),
      body?.error ?? 'unknown',
      res.status,
    );
  }
  if (!body.user) {
    throw new AuthApiError('Unexpected server response', 'bad_response', res.status);
  }
  return body.user;
}

export async function uploadUserAvatar(
  token: string,
  params: { uri: string; fileName: string; mimeType?: string },
): Promise<{ url: string; publicId: string }> {
  const body = new FormData();
  const name = params.fileName || `avatar-${Date.now()}.jpg`;
  const type = params.mimeType || 'image/jpeg';

  if (Platform.OS === 'web') {
    const blob = await fetch(params.uri).then((r) => r.blob());
    body.append('image', blob, name);
  } else {
    body.append(
      'image',
      {
        uri: params.uri,
        name,
        type,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${getApiBaseUrl()}/api/uploads/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const parsed = (await readBody(res)) as { error?: string; url?: string; publicId?: string };
  if (!res.ok) {
    throw new AuthApiError(
      mapAuthError(String(parsed.error ?? 'unknown'), res.status),
      String(parsed.error ?? 'unknown'),
      res.status,
    );
  }
  if (!parsed.url || !parsed.publicId) {
    throw new AuthApiError('Unexpected server response', 'bad_response', res.status);
  }
  return { url: parsed.url, publicId: parsed.publicId };
}

function mapAuthError(code: string | undefined, status: number): string {
  switch (code) {
    case 'invalid_email':
      return 'Enter a valid email address.';
    case 'password_too_short':
      return 'Use at least 8 characters for your password.';
    case 'email_already_registered':
      return 'That email is already registered. Try signing in.';
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_and_password_required':
      return 'Email and password are required.';
    case 'register_failed':
      return 'Registration failed on the server. Check the server terminal (MongoDB and JWT_SECRET).';
    case 'login_failed':
      return 'Sign-in failed on the server. Check the server terminal.';
    case 'missing_token':
    case 'invalid_token':
      return 'Your session expired. Please sign in again.';
    case 'avatarUrl_required':
      return 'No profile field was sent.';
    case 'invalid_avatar_url':
      return 'Use a secure (https) image URL, or clear the photo.';
    case 'profile_update_failed':
      return 'Could not update your profile. Try again.';
    case 'failed_to_upload_avatar':
      return 'Could not upload the photo. Ensure the server has Cloudinary configured.';
    default:
      if (status === 502) {
        return 'Server temporarily unavailable (502). If you use Railway, verify the service is healthy and target port matches the app listen port.';
      }
      if (status >= 500) return 'Something went wrong. Try again later.';
      return 'Could not complete the request. Please try again.';
  }
}
