import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '../types/chat';
import { chatRoomTheme as t } from '../theme/chatRoomTheme';

type Props = {
  message: Message;
  peerAvatarLetter?: string;
  selfAvatarLetter?: string;
  /** When true, show a small green badge on the peer avatar (incoming side). */
  peerOnline?: boolean;
};

function Avatar({ letter, onlineBadge }: { letter: string; onlineBadge?: boolean }) {
  const ch = letter.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View style={styles.avatarWrap}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{ch}</Text>
      </View>
      {onlineBadge ? (
        <View style={styles.onlineBadge}>
          <Ionicons name="checkmark" size={10} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

export function MessageBubble({
  message,
  peerAvatarLetter = '?',
  selfAvatarLetter = 'Y',
  peerOnline,
}: Props) {
  const outgoing = message.outgoing;

  return (
    <View style={[styles.row, outgoing ? styles.rowOutgoing : styles.rowIncoming]}>
      {!outgoing ? (
        <Avatar letter={peerAvatarLetter} onlineBadge={!!peerOnline} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View style={[styles.bubble, outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
        <Text style={styles.text}>{message.text}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.time}>{message.timeLabel}</Text>
          {outgoing ? (
            <Ionicons name="checkmark-done" size={15} color="rgba(255,255,255,0.75)" style={styles.tick} />
          ) : null}
        </View>
      </View>
      {outgoing ? <Avatar letter={selfAvatarLetter} /> : <View style={styles.avatarSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  rowIncoming: {
    justifyContent: 'flex-start',
  },
  rowOutgoing: {
    justifyContent: 'flex-end',
  },
  avatarSpacer: {
    width: 36,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    position: 'relative',
  },
  onlineBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.screenBg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: t.avatarLetter,
  },
  bubble: {
    maxWidth: '76%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleIncoming: {
    backgroundColor: t.bubbleIncoming,
    borderTopLeftRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: t.bubbleOutgoing,
    borderTopRightRadius: 4,
  },
  text: {
    fontSize: 15,
    color: t.textOnBubble,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: t.timeOnBubble,
  },
  tick: {
    marginLeft: 2,
  },
});
