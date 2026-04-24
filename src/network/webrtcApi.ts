import { getApiBaseUrl } from '../config';

export type IceServerEntry = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceServersResponse = {
  iceServers: IceServerEntry[];
};

export async function fetchIceServers(token: string): Promise<IceServersResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/webrtc/ice-servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`ice_servers_${res.status}`);
  }
  return res.json() as Promise<IceServersResponse>;
}
