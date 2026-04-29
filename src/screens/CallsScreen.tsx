import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Calls tab: log is per-chat (IMO-style full-screen). This screen explains that flow.
 */
export function CallsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="call" size={40} color="rgba(0, 200, 150, 0.9)" />
      </View>
      <Text style={styles.title}>Voice and video calls</Text>
      <Text style={styles.body}>
        Open any one-to-one chat and use the phone or camera icons in the header to start a call. Incoming calls
        appear full-screen while you are in the chat.
      </Text>
      <View style={styles.hintRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color="rgba(255,255,255,0.45)" />
        <Text style={styles.hint}>WebRTC with signaling on your RChat server</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050A0E',
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0, 200, 150, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 220, 160, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 28,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
  },
  hint: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 13,
  },
});
