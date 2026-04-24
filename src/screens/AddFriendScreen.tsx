import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendRequests,
  FriendsApiError,
  sendFriendRequest,
  type IncomingFriendRequest,
  type OutgoingFriendRequest,
} from '../network/friendsApi';
import { colors } from '../theme/colors';

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Avatar({ letter }: { letter: string }) {
  const ch = letter.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarLetter}>{ch}</Text>
    </View>
  );
}

type IonName = ComponentProps<typeof Ionicons>['name'];

type SectionHeaderProps = {
  icon: IonName;
  title: string;
  subtitle: string;
  count: number;
  accent: 'incoming' | 'outgoing';
};

function SectionHeader({ icon, title, subtitle, count, accent }: SectionHeaderProps) {
  const badgeBg = accent === 'incoming' ? colors.header : '#5A6B7A';
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionIconWrap, accent === 'incoming' ? styles.sectionIconIncoming : styles.sectionIconOutgoing]}>
        <Ionicons name={icon} size={22} color={accent === 'incoming' ? colors.header : '#5A6B7A'} />
      </View>
      <View style={styles.sectionHeaderText}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={[styles.countBadge, { backgroundColor: badgeBg }]}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        </View>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function EmptyBlock({ icon, title, body }: { icon: IonName; title: string; body: string }) {
  return (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name={icon} size={28} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function AddFriendScreen() {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingFriendRequest[]>([]);
  const [listBusy, setListBusy] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!token) {
      setListBusy(false);
      return;
    }
    setListBusy(true);
    try {
      const data = await fetchFriendRequests(token);
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
    } catch {
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setListBusy(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests]),
  );

  const busyAny = actionId !== null;

  async function onSendRequest() {
    if (!token) return;
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email required', 'Enter the email address your friend signed up with.');
      return;
    }
    setSendBusy(true);
    try {
      await sendFriendRequest(token, trimmed);
      setEmail('');
      Alert.alert('Request sent', 'They will see it in their Incoming section when they open Add friend.');
      await loadRequests();
    } catch (e) {
      const msg = e instanceof FriendsApiError ? e.message : 'Could not send the request.';
      Alert.alert('Could not send', msg);
    } finally {
      setSendBusy(false);
    }
  }

  async function onAccept(id: string) {
    if (!token) return;
    setActionId(id);
    try {
      await acceptFriendRequest(token, id);
      await loadRequests();
    } catch (e) {
      const msg = e instanceof FriendsApiError ? e.message : 'Could not accept.';
      Alert.alert('Error', msg);
    } finally {
      setActionId(null);
    }
  }

  async function onDecline(id: string) {
    if (!token) return;
    setActionId(id);
    try {
      await declineFriendRequest(token, id);
      await loadRequests();
    } catch (e) {
      const msg = e instanceof FriendsApiError ? e.message : 'Could not update the request.';
      Alert.alert('Error', msg);
    } finally {
      setActionId(null);
    }
  }

  function renderIncomingBody() {
    if (listBusy) {
      return (
        <View style={styles.sectionInner}>
          <ActivityIndicator style={styles.sectionSpinner} color={colors.header} />
        </View>
      );
    }
    if (incoming.length === 0) {
      return (
        <View style={styles.sectionInner}>
          <EmptyBlock
            icon="mail-open-outline"
            title="You are all caught up"
            body="When someone sends you a request, it will show up here."
          />
        </View>
      );
    }
    return (
      <View style={styles.sectionInner}>
        {incoming.map((req) => (
          <View key={req.id} style={styles.requestCard}>
            <View style={styles.requestTop}>
              <Avatar letter={req.from.name} />
              <View style={styles.requestBody}>
                <Text style={styles.requestName} numberOfLines={1}>
                  {req.from.name}
                </Text>
                <Text style={styles.requestEmail} numberOfLines={1}>
                  {req.from.email}
                </Text>
                <View style={styles.pill}>
                  <Ionicons name="hand-left-outline" size={14} color={colors.headerDark} />
                  <Text style={styles.pillText}>Wants to connect</Text>
                </View>
              </View>
              {shortDate(req.createdAt) ? <Text style={styles.requestMeta}>{shortDate(req.createdAt)}</Text> : null}
            </View>
            <View style={styles.requestActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.btnAccept,
                  busyAny && styles.btnDisabled,
                  pressed && !busyAny && styles.btnAcceptPressed,
                ]}
                onPress={() => onAccept(req.id)}
                disabled={busyAny}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={styles.btnIcon} />
                <Text style={styles.btnAcceptLabel}>Accept</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.btnDecline,
                  busyAny && styles.btnDisabled,
                  pressed && !busyAny && styles.btnDeclinePressed,
                ]}
                onPress={() => onDecline(req.id)}
                disabled={busyAny}
              >
                <Text style={styles.btnDeclineLabel}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderOutgoingBody() {
    if (listBusy) {
      return (
        <View style={[styles.sectionInner, styles.sectionInnerMuted]}>
          <ActivityIndicator style={styles.sectionSpinner} color={colors.textSecondary} />
        </View>
      );
    }
    if (outgoing.length === 0) {
      return (
        <View style={[styles.sectionInner, styles.sectionInnerMuted]}>
          <EmptyBlock
            icon="paper-plane-outline"
            title="No outgoing requests"
            body="Invite a friend by email above. Pending invites appear here."
          />
        </View>
      );
    }
    return (
      <View style={[styles.sectionInner, styles.sectionInnerMuted]}>
        {outgoing.map((req) => (
          <View key={req.id} style={styles.outgoingCard}>
            <View style={styles.requestTop}>
              <Avatar letter={req.to.name} />
              <View style={styles.requestBody}>
                <Text style={styles.requestName} numberOfLines={1}>
                  {req.to.name}
                </Text>
                <Text style={styles.requestEmail} numberOfLines={1}>
                  {req.to.email}
                </Text>
                <View style={[styles.pill, styles.pillOutgoing]}>
                  <Ionicons name="time-outline" size={14} color="#5A6B7A" />
                  <Text style={[styles.pillText, styles.pillTextOutgoing]}>Awaiting response</Text>
                </View>
              </View>
              {shortDate(req.createdAt) ? <Text style={styles.requestMeta}>{shortDate(req.createdAt)}</Text> : null}
            </View>
            <Pressable
              style={({ pressed }) => [styles.btnCancelRow, busyAny && styles.btnDisabled, pressed && !busyAny && { opacity: 0.85 }]}
              onPress={() => onDecline(req.id)}
              disabled={busyAny}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.btnCancelLabel}>Cancel request</Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroAccent} />
        <View style={styles.heroTop}>
          <View style={styles.heroIconCircle}>
            <Ionicons name="person-add" size={28} color="#fff" />
          </View>
          <View style={styles.heroTitles}>
            <Text style={styles.heroTitle}>Invite a friend</Text>
            <Text style={styles.heroSubtitle}>Send a request using their RChat account email.</Text>
          </View>
        </View>
        <View style={styles.inputShell}>
          <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="friend@email.com"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!sendBusy}
          />
        </View>
        <PrimaryButton title="Send friend request" loading={sendBusy} onPress={onSendRequest} />
      </View>

      <View style={styles.sectionShell}>
        <SectionHeader
          icon="arrow-down-circle-outline"
          title="Incoming"
          subtitle="People who want to add you"
          count={incoming.length}
          accent="incoming"
        />
        {renderIncomingBody()}
      </View>

      <View style={[styles.sectionShell, styles.sectionShellLast]}>
        <SectionHeader
          icon="arrow-up-circle-outline"
          title="Outgoing"
          subtitle="Requests you have sent"
          count={outgoing.length}
          accent="outgoing"
        />
        {renderOutgoingBody()}
      </View>
    </ScrollView>
  );
}

const shadowCard =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0D3D36',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      }
    : { elevation: 3 };

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E8F3F0',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    ...shadowCard,
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: colors.header,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingLeft: 8,
  },
  heroIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.header,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTitles: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE8E5',
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingRight: 8,
  },
  sectionShell: {
    marginTop: 22,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 4,
    paddingBottom: 8,
    ...shadowCard,
  },
  sectionShellLast: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionIconIncoming: {
    backgroundColor: 'rgba(18, 140, 126, 0.12)',
  },
  sectionIconOutgoing: {
    backgroundColor: 'rgba(90, 107, 122, 0.12)',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  countBadge: {
    marginLeft: 10,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionInner: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionInnerMuted: {
    backgroundColor: '#FAFCFB',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionSpinner: {
    paddingVertical: 28,
  },
  requestCard: {
    backgroundColor: '#F6FAF9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0EBE8',
    padding: 14,
    marginBottom: 10,
  },
  outgoingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 14,
    marginBottom: 10,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.header,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  requestBody: {
    flex: 1,
    minWidth: 0,
  },
  requestName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  requestEmail: {
    marginTop: 2,
    fontSize: 14,
    color: colors.textSecondary,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(18, 140, 126, 0.1)',
    gap: 6,
  },
  pillOutgoing: {
    backgroundColor: 'rgba(90, 107, 122, 0.1)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.headerDark,
  },
  pillTextOutgoing: {
    color: '#5A6B7A',
  },
  requestMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  btnAccept: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.header,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnAcceptPressed: {
    opacity: 0.92,
  },
  btnIcon: {
    marginRight: 6,
  },
  btnAcceptLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  btnDecline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF0F2',
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnDeclinePressed: {
    backgroundColor: '#E2E6EA',
  },
  btnDeclineLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnCancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    gap: 8,
  },
  btnCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
});
