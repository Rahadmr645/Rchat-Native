import { getApiBaseUrl } from '../config';

export type FriendRequestUser = {
  id: string;
  name: string;
  email: string;
};

export type IncomingFriendRequest = {
  id: string;
  createdAt: string;
  from: FriendRequestUser;
};

export type OutgoingFriendRequest = {
  id: string;
  createdAt: string;
  to: FriendRequestUser;
};

export type FriendRequestsResponse = {
  incoming: IncomingFriendRequest[];
  outgoing: OutgoingFriendRequest[];
};

export type ExploreRelation = 'none' | 'friends' | 'pending_out' | 'pending_in';

export type ExploreUser = {
  id: string;
  name: string;
  email: string;
  relation: ExploreRelation;
  incomingRequestId: string | null;
};

export type ExploreDirectoryResponse = {
  users: ExploreUser[];
};

export class FriendsApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FriendsApiError';
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function sendFriendRequest(token: string, email: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/friends/request`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ email: email.trim() }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FriendsApiError(
      mapFriendError(String(body.error ?? 'unknown'), body.message as string | undefined),
      String(body.error ?? 'unknown'),
      res.status,
    );
  }
}

export async function fetchExploreDirectory(token: string): Promise<ExploreDirectoryResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/friends/directory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FriendsApiError(
      mapFriendError(String(body.error ?? 'unknown')),
      String(body.error ?? 'unknown'),
      res.status,
    );
  }
  return body as unknown as ExploreDirectoryResponse;
}

export async function fetchFriendRequests(token: string): Promise<FriendRequestsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/friends/requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FriendsApiError(
      mapFriendError(String(body.error ?? 'unknown')),
      String(body.error ?? 'unknown'),
      res.status,
    );
  }
  return body as unknown as FriendRequestsResponse;
}

export async function acceptFriendRequest(token: string, requestId: string): Promise<void> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/friends/requests/${encodeURIComponent(requestId)}/accept`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new FriendsApiError(
      mapFriendError(String(body.error ?? 'unknown'), body.message as string | undefined),
      String(body.error ?? 'unknown'),
      res.status,
    );
  }
}

export async function declineFriendRequest(token: string, requestId: string): Promise<void> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/friends/requests/${encodeURIComponent(requestId)}/decline`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new FriendsApiError(
      mapFriendError(String(body.error ?? 'unknown'), body.message as string | undefined),
      String(body.error ?? 'unknown'),
      res.status,
    );
  }
}

function mapFriendError(code: string, serverMessage?: string): string {
  if (serverMessage && code !== 'unknown') return serverMessage;
  switch (code) {
    case 'email_required':
      return 'Enter an email address.';
    case 'user_not_found':
      return 'No account uses that email.';
    case 'cannot_add_self':
      return 'You cannot send a friend request to yourself.';
    case 'already_friends':
      return 'You are already friends.';
    case 'request_pending':
      return 'A request is already waiting for this person.';
    case 'reverse_pending':
      return 'They already sent you a request — check Incoming below.';
    case 'forbidden':
      return 'You cannot change this request.';
    case 'not_found':
      return 'That request is no longer available.';
    case 'list_directory_failed':
      return 'Could not load people. Try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}
