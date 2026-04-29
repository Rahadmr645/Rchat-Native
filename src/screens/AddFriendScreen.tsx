import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import { useAppTheme } from '../context/ThemeContext';
import { createAddFriendStyles } from './addFriendStyles';

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type IonName = ComponentProps<typeof Ionicons>['name'];

type SectionHeaderProps = {
  icon: IonName;
  title: string;
  subtitle: string;
  count: number;
  accent: 'incoming' | 'outgoing';
};

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

  const { colors, resolved } = useAppTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => createAddFriendStyles(colors, isDark), [colors, isDark]);

  const busyAny = actionId !== null;

  function Avatar({ letter, imageUri }: { letter: string; imageUri?: string | null }) {
    const ch = letter.trim().slice(0, 1).toUpperCase() || '?';
    const uri = imageUri?.trim();
    return (
      <View style={styles.avatar}>
        {uri ? <Image source={{ uri }} style={styles.avatarImage} /> : <Text style={styles.avatarLetter}>{ch}</Text>}
      </View>
    );
  }

  function SectionHeader({ icon, title, subtitle, count, accent }: SectionHeaderProps) {
    const badgeBg = accent === 'incoming' ? colors.header : '#5A6B7A';
    return (
      <View style={styles.sectionHeaderRow}>
        <View
          style={[
            styles.sectionIconWrap,
            accent === 'incoming' ? styles.sectionIconIncoming : styles.sectionIconOutgoing,
          ]}
        >
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
              <Avatar letter={req.from.name} imageUri={req.from.avatarUrl} />
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
              <Avatar letter={req.to.name} imageUri={req.to.avatarUrl} />
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
