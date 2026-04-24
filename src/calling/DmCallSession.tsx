import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { getChatSocket } from '../network/chatSocket';
import { fetchIceServers } from '../network/webrtcApi';
import { chatRoomTheme as theme } from '../theme/chatRoomTheme';

export type DmCallOutgoingRequest = { media: 'audio' | 'video'; nonce: number };

type Props = {
  threadId: string;
  myUserId: string;
  otherUserId?: string;
  peerTitle: string;
  token: string | null | undefined;
  outgoingRequest: DmCallOutgoingRequest | null;
  onOutgoingRequestConsumed: () => void;
};

type OverlayMode = 'hidden' | 'outgoing' | 'incoming' | 'connected';

type IncomingOffer = {
  callId: string;
  fromUserId: string;
  sdp: string;
  media: 'audio' | 'video';
};

type WebRtcNs = typeof import('react-native-webrtc');

function newCallId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DmCallSession({
  threadId,
  myUserId,
  otherUserId,
  peerTitle,
  token,
  outgoingRequest,
  onOutgoingRequestConsumed,
}: Props) {
  const [mode, setMode] = useState<OverlayMode>('hidden');
  const [mediaKind, setMediaKind] = useState<'audio' | 'video'>('audio');
  const [incoming, setIncoming] = useState<IncomingOffer | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wrtc, setWrtc] = useState<WebRtcNs | null>(null);
  const wrtcRef = useRef<WebRtcNs | null>(null);
  useEffect(() => {
    wrtcRef.current = wrtc;
  }, [wrtc]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localStreamRef = useRef<any>(null);
  const callIdRef = useRef<string | null>(null);
  const iceQueueRef = useRef<{ candidate: Record<string, unknown> }[]>([]);

  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;

  const emitCallPeer = useCallback(
    (payload: Record<string, unknown>) => {
      const callId = callIdRef.current;
      if (!callId) return;
      getChatSocket().emit('call_peer', { threadId, callId, payload });
    },
    [threadId],
  );

  const emitCallEnd = useCallback(() => {
    const callId = callIdRef.current;
    if (!callId) return;
    getChatSocket().emit('call_end', { threadId, callId });
  }, [threadId]);

  const emitCallDecline = useCallback(() => {
    const callId = callIdRef.current;
    if (!callId) return;
    getChatSocket().emit('call_decline', { threadId, callId });
  }, [threadId]);

  const disposeMedia = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((s: { track?: { stop: () => void } }) => {
        try {
          s.track?.stop();
        } catch {
          /* ignore */
        }
      });
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    try {
      localStreamRef.current?.getTracks().forEach((t: { stop: () => void }) => t.stop());
    } catch {
      /* ignore */
    }
    localStreamRef.current = null;
    setLocalUrl(null);
    setRemoteUrl(null);
    callIdRef.current = null;
    iceQueueRef.current = [];
    setWrtc(null);
  }, []);

  const flushIceQueue = useCallback(async (rtc: WebRtcNs) => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const q = iceQueueRef.current.splice(0);
    for (const wrap of q) {
      try {
        await pc.addIceCandidate(new rtc.RTCIceCandidate(wrap.candidate as never));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const attachPeer = useCallback(
    (
      rtc: WebRtcNs,
      iceServers: { urls?: string | string[]; username?: string; credential?: string }[],
    ) => {
      const pc = new rtc.RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      const p = pc as unknown as {
        onicecandidate: ((ev: { candidate?: { toJSON: () => Record<string, unknown> } | null }) => void) | null;
        ontrack: ((ev: { streams: { toURL: () => string }[] }) => void) | null;
        onconnectionstatechange: (() => void) | null;
        connectionState: string;
      };
      p.onicecandidate = (ev) => {
        if (ev.candidate) {
          emitCallPeer({ type: 'candidate', candidate: ev.candidate.toJSON() });
        }
      };
      p.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (stream) {
          setRemoteUrl(stream.toURL());
        }
      };
      p.onconnectionstatechange = () => {
        if (p.connectionState === 'failed' || p.connectionState === 'closed') {
          setMode('hidden');
          disposeMedia();
        }
      };
    },
    [disposeMedia, emitCallPeer],
  );

  const addIceCandidateSafe = useCallback(async (rtc: WebRtcNs, candidateInit: Record<string, unknown>) => {
    const pc = pcRef.current;
    if (!pc) {
      iceQueueRef.current.push({ candidate: candidateInit });
      return;
    }
    if (!pc.remoteDescription) {
      iceQueueRef.current.push({ candidate: candidateInit });
      return;
    }
    try {
      await pc.addIceCandidate(new rtc.RTCIceCandidate(candidateInit as never));
    } catch {
      iceQueueRef.current.push({ candidate: candidateInit });
    }
  }, []);

  const teardown = useCallback(() => {
    setMode('hidden');
    setIncoming(null);
    disposeMedia();
  }, [disposeMedia]);

  const handleHangup = useCallback(() => {
    emitCallEnd();
    teardown();
  }, [emitCallEnd, teardown]);

  const loadRtc = useCallback(async (): Promise<WebRtcNs> => {
    if (Constants.appOwnership === 'expo') {
      throw new Error('expo_go');
    }
    return import('react-native-webrtc');
  }, []);

  const beginOutgoing = useCallback(
    async (media: 'audio' | 'video') => {
      if (!otherUserId) {
        Alert.alert('Calls', 'Direct calls work only in one-to-one chats.');
        return;
      }
      if (!token) {
        Alert.alert('Calls', 'Sign in required.');
        return;
      }
      setBusy(true);
      setMediaKind(media);
      setMode('outgoing');
      const callId = newCallId();
      callIdRef.current = callId;
      try {
        const rtc = await loadRtc();
        setWrtc(rtc);
        const { iceServers } = await fetchIceServers(token);
        attachPeer(rtc, iceServers);
        const pc = pcRef.current;
        if (!pc) throw new Error('no_pc');

        const stream = await rtc.mediaDevices.getUserMedia({
          audio: true,
          video: media === 'video' ? { facingMode: 'user' } : false,
        });
        localStreamRef.current = stream;
        setLocalUrl(stream.toURL());
        stream.getTracks().forEach((track: unknown) => pc.addTrack(track as never, stream));

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        emitCallPeer({ type: 'offer', sdp: offer.sdp, media });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'expo_go') {
          Alert.alert(
            'Calls',
            'Voice and video need a development build with native WebRTC (Expo Go does not include it). Run: npx expo prebuild then npx expo run:android or run:ios.',
          );
        } else {
          Alert.alert('Call failed', msg);
        }
        teardown();
      } finally {
        setBusy(false);
      }
    },
    [attachPeer, emitCallPeer, loadRtc, otherUserId, teardown, token],
  );

  const acceptIncoming = useCallback(async () => {
    const offer = incomingRef.current;
    if (!offer || !token) return;
    setBusy(true);
    try {
      const rtc = await loadRtc();
      setWrtc(rtc);
      const { iceServers } = await fetchIceServers(token);
      attachPeer(rtc, iceServers);
      const pc = pcRef.current;
      if (!pc) throw new Error('no_pc');

      const stream = await rtc.mediaDevices.getUserMedia({
        audio: true,
        video: offer.media === 'video' ? { facingMode: 'user' } : false,
      });
      localStreamRef.current = stream;
      setLocalUrl(stream.toURL());
      stream.getTracks().forEach((track: unknown) => pc.addTrack(track as never, stream));

      await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
      await flushIceQueue(rtc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitCallPeer({ type: 'answer', sdp: answer.sdp });
      setIncoming(null);
      setMode('connected');
    } catch (e) {
      Alert.alert('Call failed', e instanceof Error ? e.message : String(e));
      emitCallDecline();
      teardown();
    } finally {
      setBusy(false);
    }
  }, [attachPeer, emitCallDecline, emitCallPeer, flushIceQueue, loadRtc, teardown, token]);

  const declineIncoming = useCallback(() => {
    emitCallDecline();
    teardown();
  }, [emitCallDecline, teardown]);

  useEffect(() => {
    if (!outgoingRequest) return;
    onOutgoingRequestConsumed();
    void beginOutgoing(outgoingRequest.media);
  }, [outgoingRequest, onOutgoingRequestConsumed, beginOutgoing]);

  useEffect(() => {
    const socket = getChatSocket();

    const onPeer = async (msg: {
      threadId?: string;
      callId?: string;
      fromUserId?: string;
      payload?: { type?: string; sdp?: string; media?: string; candidate?: Record<string, unknown> };
    }) => {
      if (msg.threadId !== threadId || !msg.payload || typeof msg.callId !== 'string') return;
      if (msg.fromUserId === myUserId) return;

      const { type, sdp, media, candidate } = msg.payload;

      if (type === 'offer' && typeof sdp === 'string') {
        callIdRef.current = msg.callId;
        setMediaKind(media === 'video' ? 'video' : 'audio');
        setIncoming({
          callId: msg.callId,
          fromUserId: String(msg.fromUserId),
          sdp,
          media: media === 'video' ? 'video' : 'audio',
        });
        setMode('incoming');
        return;
      }

      if (type === 'answer' && typeof sdp === 'string') {
        const rtc = await loadRtc().catch(() => null);
        if (!rtc) return;
        setWrtc(rtc);
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'answer', sdp }));
          await flushIceQueue(rtc);
          setMode('connected');
        } catch (e) {
          console.warn(e);
        }
        return;
      }

      if (type === 'candidate' && candidate && typeof candidate === 'object') {
        const rtc = wrtcRef.current ?? (await loadRtc().catch(() => null));
        if (!rtc) return;
        if (!wrtcRef.current) setWrtc(rtc);
        await addIceCandidateSafe(rtc, candidate);
      }
    };

    const onEnded = (msg: { threadId?: string; callId?: string }) => {
      if (msg.threadId !== threadId) return;
      if (callIdRef.current && msg.callId !== callIdRef.current) return;
      teardown();
    };

    const onDeclined = (msg: { threadId?: string; callId?: string }) => {
      if (msg.threadId !== threadId) return;
      if (callIdRef.current && msg.callId !== callIdRef.current) return;
      Alert.alert('Call', 'Declined.');
      teardown();
    };

    socket.on('call_peer', onPeer);
    socket.on('call_ended', onEnded);
    socket.on('call_declined', onDeclined);
    return () => {
      socket.off('call_peer', onPeer);
      socket.off('call_ended', onEnded);
      socket.off('call_declined', onDeclined);
    };
  }, [addIceCandidateSafe, flushIceQueue, loadRtc, myUserId, teardown, threadId]);

  useEffect(() => {
    return () => {
      disposeMedia();
    };
  }, [disposeMedia]);

  const visible = mode !== 'hidden';
  const RTCViewComp = wrtc?.RTCView ?? null;
  const showVideo =
    mediaKind === 'video' && RTCViewComp != null && (mode === 'outgoing' || mode === 'connected');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleHangup}>
      <View style={styles.sheet}>
        <View style={styles.topBar}>
          <Text style={styles.title}>{peerTitle}</Text>
          <Text style={styles.sub}>
            {mode === 'incoming'
              ? 'Incoming call'
              : mode === 'outgoing'
                ? 'Calling…'
                : mediaKind === 'video'
                  ? 'Video'
                  : 'Voice'}
          </Text>
        </View>

        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.bubbleOutgoing} />
          </View>
        ) : null}

        {showVideo ? (
          <View style={styles.videoStage}>
            {remoteUrl ? (
              <RTCViewComp streamURL={remoteUrl} style={styles.remote} objectFit="cover" zOrder={0} />
            ) : (
              <View style={styles.remotePlaceholder}>
                <Text style={styles.placeholderText}>Waiting for video…</Text>
              </View>
            )}
            {localUrl ? (
              <RTCViewComp
                streamURL={localUrl}
                style={styles.pip}
                objectFit="cover"
                mirror
                zOrder={1}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.audioStage}>
            <View style={styles.bigAvatar}>
              <Text style={styles.bigLetter}>{peerTitle.trim().charAt(0).toUpperCase() || '?'}</Text>
            </View>
            <Text style={styles.audioHint}>Secure WebRTC · signaling via your server</Text>
          </View>
        )}

        {mode === 'incoming' && incoming ? (
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.decline]} onPress={declineIncoming}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.accept]} onPress={() => void acceptIncoming()}>
              <Ionicons name="call" size={28} color="#fff" />
              <Text style={styles.btnLabel}>Accept</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.hangupWrap} onPress={handleHangup}>
            <View style={styles.hangup}>
              <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </View>
            <Text style={styles.hangupLabel}>End call</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: theme.screenBg,
    paddingTop: 48,
    paddingHorizontal: 20,
  },
  topBar: {
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  sub: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    fontSize: 15,
  },
  center: {
    paddingVertical: 12,
  },
  videoStage: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    marginBottom: 20,
  },
  remote: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  remotePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.5)',
  },
  pip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 112,
    height: 160,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  audioStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigLetter: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.avatarLetter,
  },
  audioHint: {
    marginTop: 20,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
  },
  btn: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  decline: {
    backgroundColor: '#c0392b',
  },
  accept: {
    backgroundColor: '#27ae60',
  },
  btnLabel: {
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  hangupWrap: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  hangup: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupLabel: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 10,
    fontWeight: '600',
  },
});
