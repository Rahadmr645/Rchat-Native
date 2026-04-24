import { useMemo } from 'react';
import { useNetworkState } from 'expo-network';

/**
 * True when the device has a connection and internet is not reported as unreachable.
 * Used so "online" presence UI only shows when local network state allows it.
 */
export function useDeviceInternetOnline(): boolean {
  const state = useNetworkState();
  return useMemo(() => {
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  }, [state.isConnected, state.isInternetReachable]);
}
