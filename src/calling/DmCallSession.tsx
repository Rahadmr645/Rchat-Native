import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatSocket } from '../network/chatSocket';
import { fetchIceServers } from '../network/webrtcApi';
import { chatRoomTheme as theme } from '../theme/chatRoomTheme';

export type DmCallOutgoingRequest = { media: 'audio' | 'video'; nonce: number };

type Props = {
  threadId: string;
  myUserId: string;
  otherUserId?: string;
  peerTitle: string;
  /** Single letter for avatar (IMO-style). Falls back to first letter of title. */
  peerAvatarLetter?: string;
  /** Peer profile photo (voice call / ringing). */
  peerAvatarUrl?: string;
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

const IMO = {
  bg: '#050A0E',
  bgTeal: '#0A1A18',
  ring: 'rgba(0, 220, 160, 0.45)',
  ringSoft: 'rgba(0, 200, 150, 0.12)',
  controlBg: 'rgba(255,255,255,0.14)',
  controlBgActive: 'rgba(255,255,255,0.28)',
  endRed: '#E53935',
  endRedInner: '#FF5252',
  accept: '#2ECC71',
  decline: '#E53935',
  subtext: 'rgba(255,255,255,0.55)',
} as const;

function newCallId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCallDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function peerLetterFromProps(peerTitle: string, peerAvatarLetter?: string): string {
  const fromParam = peerAvatarLetter?.trim();
  if (fromParam) return fromParam.charAt(0).toUpperCase();
  const t = peerTitle.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

async function applyCallAudioMode(speakerOn: boolean) {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: !speakerOn,
    });
  } catch {
    /* ignore */
  }
}

export function DmCallSession({
  threadId,
  myUserId,
  otherUserId,
  peerTitle,
  peerAvatarLetter,
  peerAvatarUrl,
  token,
  outgoingRequest,
  onOutgoingRequestConsumed,
}: Props) {
  const insets = useSafeAreaInsets();
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

  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [callSeconds, setCallSeconds] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localStreamRef = useRef<any>(null);
  /** Display capture stream from getDisplayMedia (separate from camera localStream). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const screenStreamRef = useRef<any>(null);
  const callIdRef = useRef<string | null>(null);
  const iceQueueRef = useRef<{ candidate: Record<string, unknown> }[]>([]);

  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;

  const peerLetter = peerLetterFromProps(peerTitle, peerAvatarLetter);
  const peerPhoto = peerAvatarUrl?.trim() || null;

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

  const setMicEnabled = useCallback((enabled: boolean) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t: { enabled: boolean }) => {
      t.enabled = enabled;
    });
  }, []);

  const setOutgoingVideoEnabled = useCallback((enabled: boolean) => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t: { enabled: boolean }) => {
      t.enabled = enabled;
    });
    try {
      pc?.getSenders().forEach((s: { track?: { kind?: string; enabled: boolean } }) => {
        if (s.track?.kind === 'video') s.track.enabled = enabled;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const disposeMedia = useCallback(() => {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    pulse.setValue(0);
    try {
      screenStreamRef.current?.getTracks().forEach((t: { stop: () => void }) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;
    setScreenSharing(false);
    setScreenShareBusy(false);
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
    setMuted(false);
    setSpeakerOn(true);
    setVideoPaused(false);
    setFrontCamera(true);
    setCallSeconds(0);
    void applyCallAudioMode(true);
  }, [pulse]);

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
      await applyCallAudioMode(speakerOn);
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
    [attachPeer, emitCallPeer, loadRtc, otherUserId, speakerOn, teardown, token],
  );

  const acceptIncoming = useCallback(async () => {
    const offer = incomingRef.current;
    if (!offer || !token) return;
    setBusy(true);
    await applyCallAudioMode(speakerOn);
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
  }, [attachPeer, emitCallDecline, emitCallPeer, flushIceQueue, loadRtc, speakerOn, teardown, token]);

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

  useEffect(() => {
    const ring = mode === 'outgoing' || mode === 'incoming';
    if (!ring) {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
    };
  }, [mode, pulse]);

  useEffect(() => {
    if (mode !== 'connected') {
      setCallSeconds(0);
      return;
    }
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const visible = mode !== 'hidden';

  useEffect(() => {
    if (!visible) return;
    void applyCallAudioMode(speakerOn);
  }, [speakerOn, visible]);

  useEffect(() => {
    setMicEnabled(!muted);
  }, [muted, setMicEnabled]);

  useEffect(() => {
    if (mediaKind !== 'video') return;
    setOutgoingVideoEnabled(!videoPaused);
  }, [mediaKind, setOutgoingVideoEnabled, videoPaused]);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((s) => !s);
  }, []);

  const toggleVideoPause = useCallback(() => {
    if (mediaKind !== 'video') return;
    setVideoPaused((v) => !v);
  }, [mediaKind]);

  const flipCamera = useCallback(async () => {
    if (mediaKind !== 'video' || screenSharing) return;
    const rtc = wrtcRef.current ?? (await loadRtc().catch(() => null));
    if (!rtc) return;
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    const nextFront = !frontCamera;
    const facingMode = nextFront ? 'user' : 'environment';
    try {
      const newStream = await rtc.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode },
      });
      const newVideo = newStream.getVideoTracks()[0];
      if (!newVideo) return;
      const sender = pc.getSenders().find((s: { track?: { kind?: string } }) => s.track?.kind === 'video');
      const old = stream.getVideoTracks()[0];
      if (sender) {
        await sender.replaceTrack(newVideo);
      }
      if (old) {
        try {
          stream.removeTrack(old);
        } catch {
          /* ignore */
        }
        old.stop();
      }
      try {
        stream.addTrack(newVideo);
      } catch {
        /* ignore */
      }
      setFrontCamera(nextFront);
      setLocalUrl(stream.toURL());
    } catch (e) {
      console.warn('flip_camera', e);
    }
  }, [frontCamera, loadRtc, mediaKind, screenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (mediaKind !== 'video') return;
    const pc = pcRef.current;
    const localStream = localStreamRef.current;
    if (!pc || !localStream) return;

    if (screenSharing) {
      setScreenShareBusy(true);
      try {
        const sender = pc.getSenders().find((s: { track?: { kind?: string } }) => s.track?.kind === 'video');
        const cam = localStream.getVideoTracks()[0];
        if (sender && cam) {
          await sender.replaceTrack(cam);
        }
        try {
          screenStreamRef.current?.getTracks().forEach((t: { stop: () => void }) => t.stop());
        } catch {
          /* ignore */
        }
        screenStreamRef.current = null;
        setScreenSharing(false);
        setOutgoingVideoEnabled(!videoPaused);
      } catch (e) {
        console.warn('stop_screen_share', e);
        Alert.alert('Screen share', e instanceof Error ? e.message : String(e));
      } finally {
        setScreenShareBusy(false);
      }
      return;
    }

    setScreenShareBusy(true);
    try {
      const rtc = wrtcRef.current ?? (await loadRtc().catch(() => null));
      if (!rtc) return;
      if (!wrtcRef.current) setWrtc(rtc);

      const displayConstraints =
        Platform.OS === 'android' ? { android: { createConfigForDefaultDisplay: true as const } } : {};
      // react-native-webrtc typings omit optional constraints; runtime accepts Android options.
      const displayStream = await (
        rtc.mediaDevices as { getDisplayMedia: (c?: object) => Promise<typeof localStreamRef.current> }
      ).getDisplayMedia(displayConstraints);
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        displayStream.getTracks().forEach((t: { stop: () => void }) => t.stop());
        throw new Error('No screen video track');
      }
      const sender = pc.getSenders().find((s: { track?: { kind?: string } }) => s.track?.kind === 'video');
      if (!sender) {
        screenTrack.stop();
        throw new Error('No video sender');
      }
      await sender.replaceTrack(screenTrack);
      screenStreamRef.current = displayStream;
      setScreenSharing(true);
      screenTrack.enabled = !videoPaused;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== 'expo_go') {
        Alert.alert(
          'Screen share',
          Platform.OS === 'ios'
            ? `${msg}\n\nIf this fails, iOS may need a ReplayKit broadcast extension and ScreenCapturePickerView in the native project (see react-native-webrtc docs).`
            : msg,
        );
      }
    } finally {
      setScreenShareBusy(false);
    }
  }, [mediaKind, screenSharing, setOutgoingVideoEnabled, setWrtc, videoPaused]);

  const RTCViewComp = wrtc?.RTCView ?? null;
  const ScreenCapturePicker = wrtc?.ScreenCapturePickerView ?? null;
  const isVideo = mediaKind === 'video' && RTCViewComp != null;
  const hasRemote = Boolean(remoteUrl);
  const mainVideoUrl =
    isVideo && (mode === 'connected' || mode === 'outgoing')
      ? mode === 'connected' && hasRemote
        ? remoteUrl
        : localUrl
      : null;
  const pipVideoUrl =
    isVideo && mode === 'connected' && hasRemote && localUrl ? localUrl : null;

  const statusLine =
    mode === 'incoming'
      ? incoming?.media === 'video'
        ? 'Incoming video call'
        : 'Incoming voice call'
      : mode === 'outgoing'
        ? 'Calling…'
        : mode === 'connected'
          ? formatCallDuration(callSeconds)
          : '';

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleHangup}
    >
      {visible ? <StatusBar style="light" /> : null}
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.bgWash} />
        <View style={styles.bgGlow} />

        <View style={styles.topMeta}>
          <Text style={styles.peerName} numberOfLines={1}>
            {peerTitle}
          </Text>
          <Text style={styles.statusText} numberOfLines={1}>
            {statusLine}
          </Text>
          {mode === 'connected' && mediaKind === 'audio' ? (
            <Text style={styles.encryptedHint}>End-to-end encrypted</Text>
          ) : null}
        </View>

        {busy ? (
          <View style={styles.busyWrap}>
            <ActivityIndicator size="large" color={IMO.ring} />
          </View>
        ) : null}

        {Platform.OS === 'ios' && isVideo && ScreenCapturePicker ? (
          <View
            style={{
              position: 'absolute',
              width: 2,
              height: 2,
              opacity: 0.02,
              left: 0,
              top: insets.top + 4,
              zIndex: 3,
            }}
            pointerEvents="none"
          >
            <ScreenCapturePicker />
          </View>
        ) : null}

        {isVideo && (mode === 'outgoing' || mode === 'connected') ? (
          <View style={styles.videoStage}>
            {mainVideoUrl ? (
              <RTCViewComp streamURL={mainVideoUrl} style={styles.remote} objectFit="cover" zOrder={0} />
            ) : (
              <View style={styles.remotePlaceholder}>
                <Text style={styles.placeholderText}>Starting camera…</Text>
              </View>
            )}
            {pipVideoUrl ? (
              <RTCViewComp
                streamURL={pipVideoUrl}
                style={styles.pip}
                objectFit="cover"
                mirror={frontCamera}
                zOrder={1}
              />
            ) : null}
            {mode === 'outgoing' && !hasRemote ? (
              <View style={styles.outgoingVideoBadge} pointerEvents="none">
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.outgoingVideoBadgeText}>You</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.audioStage}>
            <View style={styles.avatarRingHost}>
              <Animated.View
                style={[
                  styles.ringPulse,
                  {
                    opacity: ringOpacity,
                    transform: [{ scale: ringScale }],
                  },
                ]}
              />
              <View style={styles.bigAvatar}>
                {peerPhoto ? (
                  <Image source={{ uri: peerPhoto }} style={styles.bigAvatarImage} accessibilityLabel="Peer" />
                ) : (
                  <Text style={styles.bigLetter}>{peerLetter}</Text>
                )}
              </View>
            </View>
            {mode === 'connected' && mediaKind === 'audio' ? (
              <Text style={styles.timerLarge}>{formatCallDuration(callSeconds)}</Text>
            ) : null}
            {(mode === 'outgoing' || mode === 'incoming') && mediaKind === 'audio' ? (
              <Text style={styles.audioSub}>Secure WebRTC</Text>
            ) : null}
          </View>
        )}

        {mode === 'incoming' && incoming ? (
          <View style={styles.incomingActions}>
            <Pressable style={styles.incomingBtnWrap} onPress={declineIncoming}>
              <View style={[styles.incomingCircle, styles.declineCircle]}>
                <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </View>
              <Text style={styles.incomingLabel}>Decline</Text>
            </Pressable>
            <Pressable style={styles.incomingBtnWrap} onPress={() => void acceptIncoming()}>
              <View style={[styles.incomingCircle, styles.acceptCircle]}>
                <Ionicons name="call" size={32} color="#fff" />
              </View>
              <Text style={styles.incomingLabel}>Accept</Text>
            </Pressable>
          </View>
        ) : mode !== 'incoming' ? (
          <View style={styles.controlsColumn}>
            <View style={styles.controlRow}>
              <Pressable
                style={styles.controlHit}
                onPress={toggleMute}
                accessibilityRole="button"
                accessibilityLabel={muted ? 'Unmute' : 'Mute'}
              >
                <View style={[styles.controlCircle, muted && styles.controlCircleActive]}>
                  <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
                </View>
                <Text style={styles.controlCap}>Mute</Text>
              </Pressable>
              <Pressable
                style={styles.controlHit}
                onPress={toggleSpeaker}
                accessibilityRole="button"
                accessibilityLabel={speakerOn ? 'Earpiece' : 'Speaker'}
              >
                <View style={[styles.controlCircle, speakerOn && styles.controlCircleDim]}>
                  <Ionicons name={speakerOn ? 'volume-high' : 'ear-outline'} size={26} color="#fff" />
                </View>
                <Text style={styles.controlCap}>Speaker</Text>
              </Pressable>
              {mediaKind === 'video' ? (
                <>
                  <Pressable style={styles.controlHit} onPress={toggleVideoPause}>
                    <View style={[styles.controlCircle, videoPaused && styles.controlCircleActive]}>
                      <Ionicons name={videoPaused ? 'videocam-off' : 'videocam'} size={26} color="#fff" />
                    </View>
                    <Text style={styles.controlCap}>Video</Text>
                  </Pressable>
                  <Pressable
                    style={styles.controlHit}
                    onPress={() => void flipCamera()}
                    disabled={screenSharing}
                  >
                    <View style={[styles.controlCircle, screenSharing && styles.controlCircleDim]}>
                      <Ionicons name="camera-reverse" size={26} color="#fff" />
                    </View>
                    <Text style={styles.controlCap}>Flip</Text>
                  </Pressable>
                  <Pressable
                    style={styles.controlHit}
                    onPress={() => void toggleScreenShare()}
                    disabled={screenShareBusy}
                    accessibilityRole="button"
                    accessibilityLabel={screenSharing ? 'Stop sharing screen' : 'Share screen'}
                  >
                    <View
                      style={[
                        styles.controlCircle,
                        screenSharing && styles.controlCircleActive,
                        screenShareBusy && styles.controlCircleDim,
                      ]}
                    >
                      {screenShareBusy ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons
                          name={screenSharing ? 'stop-circle' : 'desktop-outline'}
                          size={26}
                          color="#fff"
                        />
                      )}
                    </View>
                    <Text style={styles.controlCap}>{screenSharing ? 'Stop share' : 'Share'}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>

            <Pressable style={styles.endWrap} onPress={handleHangup} accessibilityRole="button">
              <View style={styles.endCircleOuter}>
                <View style={styles.endCircleInner}>
                  <Ionicons name="call" size={34} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                </View>
              </View>
              <Text style={styles.endLabel}>End call</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: IMO.bg,
    paddingHorizontal: 20,
  },
  bgWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: IMO.bgTeal,
    opacity: 0.85,
  },
  bgGlow: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: IMO.ringSoft,
  },
  topMeta: {
    alignItems: 'center',
    marginBottom: 8,
    zIndex: 2,
  },
  peerName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    maxWidth: '100%',
  },
  statusText: {
    color: IMO.subtext,
    marginTop: 6,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  encryptedHint: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  busyWrap: {
    paddingVertical: 16,
    zIndex: 2,
  },
  videoStage: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
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
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
  },
  pip: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 108,
    height: 152,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  outgoingVideoBadge: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  outgoingVideoBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  audioStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    zIndex: 1,
  },
  avatarRingHost: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPulse: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: IMO.ring,
  },
  bigAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: theme.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  bigAvatarImage: {
    width: '100%',
    height: '100%',
  },
  bigLetter: {
    fontSize: 52,
    fontWeight: '700',
    color: theme.avatarLetter,
  },
  timerLarge: {
    marginTop: 28,
    fontSize: 36,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.92)',
    fontVariant: ['tabular-nums'],
  },
  audioSub: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 13,
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingVertical: 28,
    paddingBottom: 8,
  },
  incomingBtnWrap: {
    alignItems: 'center',
    minWidth: 120,
  },
  incomingCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  declineCircle: {
    backgroundColor: IMO.decline,
  },
  acceptCircle: {
    backgroundColor: IMO.accept,
  },
  incomingLabel: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  controlsColumn: {
    paddingTop: 8,
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    rowGap: 14,
  },
  controlHit: {
    alignItems: 'center',
    width: 76,
  },
  controlCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: IMO.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlCircleActive: {
    backgroundColor: 'rgba(229, 57, 53, 0.55)',
  },
  controlCircleDim: {
    backgroundColor: IMO.controlBgActive,
  },
  controlCap: {
    marginTop: 6,
    fontSize: 11,
    color: IMO.subtext,
    fontWeight: '600',
  },
  endWrap: {
    alignItems: 'center',
    marginTop: 10,
    paddingBottom: 4,
  },
  endCircleOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(229, 57, 53, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endCircleInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: IMO.endRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: IMO.endRedInner,
  },
  endLabel: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
});
