import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createCallSession, getIceServers, getCallMetrics, type CallMetrics } from '../service/Api-call';
import CallChatButton from '../components/llamada/CallChatButton';
import CallControls from '../components/llamada/CallControls';
import '../styles/CallPage.css';
import '../styles/Chat.css';

import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatContact } from '../service/Api-chat';

type WsEnvelopeType =
  | 'JOIN'
  | 'JOIN_ACK'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'RTC_CONNECTED'
  | 'HEARTBEAT'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
  | 'END'
  | 'ERROR';

interface WsEnvelope {
  type: WsEnvelopeType;
  sessionId: string;
  reservationId?: string;
  from?: string;
  to?: string;
  payload?: any;
  ts?: number;
  traceId?: string;
}

interface JoinAckPayload {
  initiator?: boolean;
}

function wsProto() {
  return globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
}

function tuneOpusInSdp(sdp?: string) {
  return sdp ?? '';
}

function normalizeIceServers(raw: any): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const isOk = (u: string) =>
    /^(stun:|turns?:)/i.test(u) &&
    !u.trim().startsWith('#') &&
    !u.trim().startsWith('//');

  const push = (u: string, src?: any) => {
    const url = (u || '').trim();
    if (!isOk(url)) return;
    const ice: RTCIceServer = { urls: url };
    if (src?.username) ice.username = src.username;
    if (src?.credential) ice.credential = src.credential;
    servers.push(ice);
  };

  if (Array.isArray(raw)) {
    raw.forEach((e) => {
      if (typeof e === 'string') {
        push(e);
      } else if (e && typeof e === 'object') {
        const urls = e.urls ?? e.url;
        if (Array.isArray(urls)) urls.forEach((u) => push(u, e));
        else if (typeof urls === 'string') push(urls, e);
      }
    });
  } else if (raw && typeof raw === 'object') {
    const urls = raw.urls ?? raw.url;
    if (Array.isArray(urls)) urls.forEach((u) => push(u, raw));
    else if (typeof urls === 'string') push(urls, raw);
  }

  if (!servers.length) {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }
  return servers;
}

type CallStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

const MAX_RECONNECT_ATTEMPTS = 3;

export default function CallPage() {
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const search = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const auth = useAuth();
  const token = useMemo(
    () => auth.user?.id_token || auth.user?.access_token || '',
    [auth.user],
  );
  const userId = useMemo(
    () =>
      (auth.user?.profile as any)?.sub ||
      (auth.user?.profile as any)?.userId ||
      (auth.user?.profile as any)?.preferred_username ||
      '',
    [auth.user],
  );

  const [status, setStatus] = useState<CallStatus>('idle');
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdParam);
  const [reservationId, setReservationId] = useState<string | undefined>(
    search.get('reservationId') || undefined,
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiTimerRef = useRef<number | null>(null);

  const remoteContainerRef = useRef<HTMLDivElement | null>(null);
  const callStartRef = useRef<number | null>(null);
  const [callDurationSec, setCallDurationSec] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [chatContact, setChatContact] = useState<ChatContact | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const { peerId, peerName, peerEmail, peerAvatar, role: callerRole } =
    (location.state || {}) as {
      peerId?: string;
      peerName?: string;
      peerEmail?: string;
      peerAvatar?: string;
      role?: 'student' | 'tutor';
    };

  const sidRef = useRef<string | undefined>(sessionId);
  const ridRef = useRef<string | undefined>(reservationId);
  useEffect(() => {
    sidRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    ridRef.current = reservationId;
  }, [reservationId]);
  useEffect(() => {
    if (!peerId || !userId || !token) return;
    setChatContact({
      id: peerId,
      sub: peerId,
      name: peerName || 'Usuario',
      email: peerEmail || 'N/A',
      avatarUrl: peerAvatar,
    });
  }, [peerId, peerName, peerEmail, peerAvatar, userId, token]);

  useEffect(() => {
    const handler = () => setIsChatOpen(true);
    globalThis.addEventListener('open-chat-drawer', handler as EventListener);
    return () => globalThis.removeEventListener('open-chat-drawer', handler as EventListener);
  }, []);

  const bumpUiVisible = useCallback(() => {
    setShowUi(true);

    if (uiTimerRef.current) {
      globalThis.clearTimeout(uiTimerRef.current);
      uiTimerRef.current = null;
    }

    if (!document.fullscreenElement) return;

    uiTimerRef.current = globalThis.setTimeout(() => {
      setShowUi(false);
    }, 3000) as unknown as number;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = remoteContainerRef.current;
    if (!container) return;

    const anyDoc = document as any;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.()
        .then(() => {
          setIsFullscreen(true);
          setShowUi(true);
          bumpUiVisible();
        })
        .catch(() => { });
    } else {
      anyDoc.exitFullscreen?.()
        .then(() => {
          setIsFullscreen(false);
          setShowUi(true);
          if (uiTimerRef.current) {
            globalThis.clearTimeout(uiTimerRef.current);
            uiTimerRef.current = null;
          }
        })
        .catch(() => { });
    }
  }, [bumpUiVisible]);

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      setShowUi(true);

      if (!fs && uiTimerRef.current) {
        globalThis.clearTimeout(uiTimerRef.current);
        uiTimerRef.current = null;
      } else if (fs) {
        bumpUiVisible();
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [bumpUiVisible]);

  useEffect(() => {
    if (!isFullscreen) return;

    const handleUserActivity = () => {
      bumpUiVisible();
    };

    const doc = document;
    doc.addEventListener('mousemove', handleUserActivity);
    doc.addEventListener('mousedown', handleUserActivity);
    doc.addEventListener('touchstart', handleUserActivity);
    doc.addEventListener('keydown', handleUserActivity);

    return () => {
      doc.removeEventListener('mousemove', handleUserActivity);
      doc.removeEventListener('mousedown', handleUserActivity);
      doc.removeEventListener('touchstart', handleUserActivity);
      doc.removeEventListener('keydown', handleUserActivity);
    };
  }, [isFullscreen, bumpUiVisible]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const wsReadyRef = useRef(false);
  const ackReadyRef = useRef(false);
  const initiatorRef = useRef(false);
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const peerPresentRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const sentRtcConnectedRef = useRef(false);
  const hbTimerRef = useRef<number | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const startedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  const hasEverConnectedRef = useRef(false);
  const reconnectWindowTimerRef = useRef<number | null>(null);
  const reconnectCheckTimerRef = useRef<number | null>(null);

  const [debug, setDebug] = useState({
    signaling: 'new',
    ice: 'new',
    gathering: 'new',
    localTracks: { audio: 0, video: 0 },
    remoteTracks: { audio: 0, video: 0 },
    mediaError: '' as string | null,
  });

  const [isReconnecting, setIsReconnecting] = useState(false);

  const log = useCallback((label: string, data?: any) => {
    console.log('[CALL]', label, data ?? '');
  }, []);

  const cleanup = useCallback(() => {
    log('cleanup()');

    manualCloseRef.current = true;

    if (uiTimerRef.current) {
      globalThis.clearTimeout(uiTimerRef.current);
      uiTimerRef.current = null;
    }

    if (hbTimerRef.current) {
      globalThis.clearInterval(hbTimerRef.current);
      hbTimerRef.current = null;
    }

    if (reconnectWindowTimerRef.current) {
      globalThis.clearTimeout(reconnectWindowTimerRef.current);
      reconnectWindowTimerRef.current = null;
    }
    if (reconnectCheckTimerRef.current) {
      globalThis.clearInterval(reconnectCheckTimerRef.current);
      reconnectCheckTimerRef.current = null;
    }
    setIsReconnecting(false);

    wsRef.current?.close();
    wsRef.current = null;
    wsReadyRef.current = false;
    ackReadyRef.current = false;
    initiatorRef.current = false;
    politeRef.current = false;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    peerPresentRef.current = false;
    mediaReadyRef.current = false;
    sentRtcConnectedRef.current = false;
    pendingCandidatesRef.current = [];
    reconnectAttemptsRef.current = 0;

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => {
        if (s.track) s.track.stop();
      });
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      remoteStreamRef.current = null;
    }

    setStatus('closed');
  }, [log]);

  const sendWs = useCallback(
    (msg: Partial<WsEnvelope>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !sidRef.current) {
        return;
      }

      const env: WsEnvelope = {
        type: msg.type as WsEnvelopeType,
        sessionId: sidRef.current!,
        reservationId: ridRef.current,
        from: userId,
        ts: Date.now(),
        ...msg,
      } as WsEnvelope;

      try {
        ws.send(JSON.stringify(env));
        if (env.type !== 'HEARTBEAT') {
          log('WS SEND', { type: env.type, sessionId: env.sessionId });
        }
      } catch (e) {
        console.warn('[CALL] WS send failed', e);
      }
    },
    [log, userId],
  );

  const notifyRtcConnected = useCallback(() => {
    if (sentRtcConnectedRef.current) return;
    sentRtcConnectedRef.current = true;
    sendWs({ type: 'RTC_CONNECTED' });
  }, [sendWs]);

  const maybeNegotiate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    if (!initiatorRef.current) return;
    if (!wsReadyRef.current || !ackReadyRef.current) return;
    if (!peerPresentRef.current) return;
    if (!mediaReadyRef.current) return;
    if (pc.signalingState !== 'stable') return;
    if (makingOfferRef.current) return;

    try {
      makingOfferRef.current = true;
      log('maybeNegotiate: createOffer()', {
        signaling: pc.signalingState,
      });
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusInSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      sendWs({ type: 'OFFER', payload: pc.localDescription });
      log('OFFER sent');
    } catch (e) {
      console.error('[CALL] Error creating offer', e);
    } finally {
      makingOfferRef.current = false;
    }
  }, [log, sendWs]);

  const buildPeer = useCallback(async () => {
    const rawIce = await getIceServers().catch(() => []);
    const iceServers = normalizeIceServers(rawIce);
    log('ICE servers', iceServers);

    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 2,
    });
    pcRef.current = pc;

    remoteStreamRef.current = new MediaStream();

    pc.ontrack = (ev) => {
      const stream = remoteStreamRef.current!;
      if (!stream.getTracks().some((t) => t.id === ev.track.id)) {
        stream.addTrack(ev.track);
      }

      log('ontrack', {
        kind: ev.track.kind,
        id: ev.track.id,
        currentTracks: {
          audio: stream.getAudioTracks().length,
          video: stream.getVideoTracks().length,
        },
      });

      if (remoteVideoRef.current && ev.track.kind === 'video') {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.muted = true;
        (remoteVideoRef.current as any).volume = 0;
        remoteVideoRef.current
          .play()
          .catch((e) => console.warn('[CALL] remote video play error', e));
      }
      if (remoteAudioRef.current && ev.track.kind === 'audio') {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current
          .play()
          .catch((e) => console.warn('[CALL] remote audio play error', e));
      }

      setDebug((d) => ({
        ...d,
        remoteTracks: {
          audio: stream.getAudioTracks().length,
          video: stream.getVideoTracks().length,
        },
      }));
    };

    pc.onicecandidate = (e) => {
      if (!wsReadyRef.current || !ackReadyRef.current) return;
      if (e.candidate) {
        sendWs({ type: 'ICE_CANDIDATE', payload: e.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      log('iceConnectionState', st);
      setDebug((d) => ({ ...d, ice: st }));

      if (st === 'connected' || st === 'completed') {
        if (!callStartRef.current) {
          callStartRef.current = Date.now();
        }
        hasEverConnectedRef.current = true;

        if (isReconnecting) {
          setIsReconnecting(false);
          if (reconnectWindowTimerRef.current) {
            globalThis.clearTimeout(reconnectWindowTimerRef.current);
            reconnectWindowTimerRef.current = null;
          }
          if (reconnectCheckTimerRef.current) {
            globalThis.clearInterval(reconnectCheckTimerRef.current);
            reconnectCheckTimerRef.current = null;
          }
        }

        setStatus('connected');
        notifyRtcConnected();
      } else if (st === 'disconnected') {
        setStatus('connecting');
      } else if (st === 'failed') {
        setStatus('failed');
      }
    };

    pc.onsignalingstatechange = () => {
      setDebug((d) => ({ ...d, signaling: pc.signalingState }));
      log('signalingState', pc.signalingState);
    };
    pc.onicegatheringstatechange = () => {
      setDebug((d) => ({ ...d, gathering: pc.iceGatheringState }));
    };

    pc.onnegotiationneeded = () => {
      log('onnegotiationneeded');
      maybeNegotiate();
    };
    (pc as any).__maybeNegotiate = maybeNegotiate;

    return pc;
  }, [log, maybeNegotiate, notifyRtcConnected, sendWs, isReconnecting]);

  const acquireLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);

      const constraints: MediaStreamConstraints = {
        audio: true,
        video: isMobile
          ? {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          }
          : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
      };
      log('getUserMedia: requesting', constraints);
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      log('getUserMedia: success', {
        audio: media.getAudioTracks().length,
        video: media.getVideoTracks().length,
      });

      localStreamRef.current = media;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = media;
        localVideoRef.current.muted = true;
        (localVideoRef.current as any).volume = 0;
        localVideoRef.current
          .play()
          .catch((e) => console.warn('[CALL] local video play error', e));
      }

      setDebug((d) => ({
        ...d,
        localTracks: {
          audio: media.getAudioTracks().length,
          video: media.getVideoTracks().length,
        },
        mediaError: null,
      }));

      return media;
    } catch (e: any) {
      console.error('[CALL] Error acquiring media', e);
      setDebug((d) => ({
        ...d,
        mediaError: `${e?.name || 'Error'}: ${e?.message || ''}`,
      }));
      return null;
    }
  }, [log]);

  const addTracksToPc = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const stream = await acquireLocalMedia();
    if (!stream) {
      log('addTracksToPc: no localStream (solo recibirá medios)');
      return;
    }

    const senders = pc.getSenders();

    const attach = (kind: 'audio' | 'video') => {
      const track =
        kind === 'audio'
          ? stream.getAudioTracks()[0]
          : stream.getVideoTracks()[0];
      if (!track) return;

      let sender = senders.find(
        (s) => s.track && s.track.kind === kind,
      );
      if (sender) {
        sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    };

    attach('audio');
    attach('video');

    mediaReadyRef.current =
      stream.getAudioTracks().length > 0 ||
      stream.getVideoTracks().length > 0;

    setDebug((d) => ({
      ...d,
      localTracks: {
        audio: stream.getAudioTracks().length,
        video: stream.getVideoTracks().length,
      },
    }));

    if (
      initiatorRef.current &&
      mediaReadyRef.current &&
      wsReadyRef.current &&
      ackReadyRef.current &&
      peerPresentRef.current &&
      pc.signalingState === 'stable'
    ) {
      (pc as any).__maybeNegotiate?.();
    }
  }, [acquireLocalMedia, log]);

  const openSummaryAndMetrics = useCallback(() => {
    const now = Date.now();
    if (callStartRef.current && callDurationSec == null) {
      const diffSec = Math.round((now - callStartRef.current) / 1000);
      setCallDurationSec(diffSec);
    }

    cleanup();

    setShowSummary(true);
    getCallMetrics()
      .then(setMetrics)
      .catch(() => {
      });
  }, [cleanup, callDurationSec]);

  const onWsMessage = useCallback(
    async (ev: MessageEvent) => {
      const pc = pcRef.current;
      if (!pc) return;

      const msg: WsEnvelope = JSON.parse(ev.data);

      if (msg.type !== 'HEARTBEAT') {
        log('WS RECV', { type: msg.type, from: msg.from, payload: msg.payload });
      }
      if (msg.type === 'ERROR') {
        const errorMessage =
          (msg.payload && (msg.payload as any).message) || 'Error desconocido';
        console.error('[CALL] WS ERROR from server:', errorMessage);

        manualCloseRef.current = true;
        setStatus('failed');

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }

        return;
      }

      if (msg.from === userId && msg.type !== 'JOIN_ACK') return;
      if (
        msg.sessionId &&
        sidRef.current &&
        msg.sessionId !== sidRef.current &&
        msg.type !== 'JOIN_ACK'
      )
        return;

      if (msg.type === 'JOIN_ACK') {
        const payload = (msg.payload || {}) as JoinAckPayload;
        initiatorRef.current = !!payload.initiator;
        politeRef.current = !payload.initiator;
        ackReadyRef.current = true;

        log('JOIN_ACK', payload);

        if (msg.sessionId) {
          sidRef.current = msg.sessionId;
          setSessionId(msg.sessionId);
        }
        if (msg.reservationId) {
          ridRef.current = msg.reservationId;
          setReservationId(msg.reservationId);
        }

        await addTracksToPc();
        return;
      }

      if (msg.type === 'PEER_JOINED') {
        peerPresentRef.current = true;
        log('PEER_JOINED');

        if (reconnectWindowTimerRef.current) {
          globalThis.clearTimeout(reconnectWindowTimerRef.current);
          reconnectWindowTimerRef.current = null;
        }
        if (reconnectCheckTimerRef.current) {
          globalThis.clearInterval(reconnectCheckTimerRef.current);
          reconnectCheckTimerRef.current = null;
        }
        if (isReconnecting) {
          setIsReconnecting(false);
        }

        setStatus('connecting');
        if (initiatorRef.current && mediaReadyRef.current) {
          (pc as any).__maybeNegotiate?.();
        }
        return;
      }

      if (msg.type === 'PEER_LEFT') {
        peerPresentRef.current = false;
        log('PEER_LEFT');

        if (hasEverConnectedRef.current && !isReconnecting) {
          setIsReconnecting(true);
          setStatus('connecting');
          log('Iniciando ventana de reconexión de 2 minutos');

          if (reconnectWindowTimerRef.current) {
            globalThis.clearTimeout(reconnectWindowTimerRef.current);
            reconnectWindowTimerRef.current = null;
          }
          if (reconnectCheckTimerRef.current) {
            globalThis.clearInterval(reconnectCheckTimerRef.current);
            reconnectCheckTimerRef.current = null;
          }

          reconnectCheckTimerRef.current = globalThis.setInterval(() => {
            log('Esperando reconexión del otro usuario...');
          }, 6000) as unknown as number;

          reconnectWindowTimerRef.current = globalThis.setTimeout(() => {
            log('Ventana de reconexión agotada; finalizando llamada');

            if (reconnectCheckTimerRef.current) {
              globalThis.clearInterval(reconnectCheckTimerRef.current);
              reconnectCheckTimerRef.current = null;
            }
            reconnectWindowTimerRef.current = null;

            setIsReconnecting(false);

            cleanup();
            navigate(-1);
          }, 120000) as unknown as number;
        } else {
          setStatus('connecting');
        }

        return;
      }

      if (msg.type === 'OFFER') {
        await addTracksToPc();
        const remote: RTCSessionDescriptionInit = msg.payload;
        log('OFFER received', {
          signaling: pc.signalingState,
        });

        const making = makingOfferRef.current;
        const stable = pc.signalingState === 'stable';
        const glare = remote.type === 'offer' && (making || !stable);

        if (glare && !politeRef.current) {
          ignoreOfferRef.current = true;
          log('GLARE (impolite), ignoring offer');
          return;
        }
        ignoreOfferRef.current = false;

        if (glare && politeRef.current) {
          log('GLARE (polite), rollback local');
          await pc.setLocalDescription({ type: 'rollback' } as any);
        }

        await pc.setRemoteDescription(remote);

        if (pendingCandidatesRef.current.length > 0) {
          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(c).catch((e) =>
              console.error('[CALL] addIceCandidate queued error', e),
            );
          }
          pendingCandidatesRef.current = [];
        }

        const answer = await pc.createAnswer();
        answer.sdp = tuneOpusInSdp(answer.sdp);
        await pc.setLocalDescription(answer);
        sendWs({ type: 'ANSWER', payload: pc.localDescription });
        log('ANSWER sent');
        return;
      }

      if (msg.type === 'ANSWER') {
        log('ANSWER received', {
          signaling: pc.signalingState,
        });

        try {
          await pc.setRemoteDescription(msg.payload);

          if (pendingCandidatesRef.current.length > 0) {
            for (const c of pendingCandidatesRef.current) {
              await pc.addIceCandidate(c).catch((e) =>
                console.error('[CALL] addIceCandidate queued error', e),
              );
            }
            pendingCandidatesRef.current = [];
          }
        } catch (e) {
          console.error('[CALL] Error applying ANSWER', e);
        }

        return;
      }

      if (msg.type === 'ICE_CANDIDATE') {
        if (ignoreOfferRef.current || !msg.payload) return;
        const candidate = new RTCIceCandidate(msg.payload);
        if (!pc.remoteDescription || pc.remoteDescription.type === 'rollback') {
          pendingCandidatesRef.current.push(candidate);
        } else {
          await pc
            .addIceCandidate(candidate)
            .catch((e) =>
              console.error('[CALL] addIceCandidate error', e),
            );
        }
        return;
      }

      if (msg.type === 'END') {
        openSummaryAndMetrics();
        return;
      }

    },
    [addTracksToPc, log, openSummaryAndMetrics, userId, navigate, cleanup],
  );

  const start = useCallback(async () => {
    log('start()', {
      sessionIdParam,
      reservationIdParam: search.get('reservationId'),
    });
    setStatus('connecting');

    manualCloseRef.current = false;

    await buildPeer();
    await addTracksToPc();

    const ws = new WebSocket(
      `${wsProto()}://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net/ws/call?token=${encodeURIComponent(
        token,
      )}`,
    );

    wsRef.current = ws;

    ws.onopen = async () => {
      wsReadyRef.current = true;
      reconnectAttemptsRef.current = 0;
      log('WS opened');

      let sid = sidRef.current;
      if (!sid) {
        if (!ridRef.current) {
          console.error('[CALL] Falta reservationId para crear la sesión');
          return;
        }
        const created = await createCallSession(ridRef.current, token);
        sid = created.sessionId;
        sidRef.current = sid;
        setSessionId(sid);
        setReservationId(created.reservationId);
        log('Session created', created);
      }

      const joinMsg: WsEnvelope = {
        type: 'JOIN',
        sessionId: sid!,
        reservationId: ridRef.current || undefined,
        from: userId,
        ts: Date.now(),
      };

      ws.send(JSON.stringify(joinMsg));
      log('JOIN sent', { sessionId: sid });

      hbTimerRef.current = globalThis.setInterval(
        () => sendWs({ type: 'HEARTBEAT' }),
        10_000,
      ) as unknown as number;
    };

    ws.onmessage = onWsMessage;

    ws.onclose = () => {
      log('WS closed');
      wsRef.current = null;
      wsReadyRef.current = false;

      if (manualCloseRef.current) {
        return;
      }

      if (hbTimerRef.current) {
        globalThis.clearInterval(hbTimerRef.current);
        hbTimerRef.current = null;
      }

      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => s.track && s.track.stop());
        pcRef.current.close();
        pcRef.current = null;
      }
      remoteStreamRef.current = null;
      mediaReadyRef.current = !!localStreamRef.current;

      reconnectAttemptsRef.current += 1;

      if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        log('Max reconnect attempts reached');
        setStatus('failed');

        navigate(-1);
        return;
      }

      setStatus('connecting');
      log('Scheduling reconnect', {
        attempt: reconnectAttemptsRef.current,
      });

      setTimeout(() => {
        if (!manualCloseRef.current) {
          start();
        }
      }, 2000);
    };

    ws.onerror = (e) => {
      console.error('[CALL] WS error', e);
      setStatus('failed');
    };
  }, [
    addTracksToPc,
    buildPeer,
    log,
    onWsMessage,
    sendWs,
    sessionIdParam,
    token,
    userId,
    search,
    navigate
  ]);

  const endCall = useCallback(() => {
    sendWs({ type: 'END' });
    openSummaryAndMetrics();
  }, [openSummaryAndMetrics, sendWs]);

  const canRateTutor = callerRole === 'student';

  const formatDuration = (sec: number | null): string => {
    if (!sec || sec <= 0) return 'No disponible (la llamada no llegó a conectarse)';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (!m) return `${s} s`;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
  };

  const handleCloseSummary = () => {
    setShowSummary(false);
    navigate(-1);
  };

  const handleSubmitRating = async () => {
    if (!canRateTutor) {
      handleCloseSummary();
      return;
    }
    setSubmittingRating(true);
    try {
      console.log('Rating enviado', {
        rating,
        comment: reviewComment,
        sessionId: sidRef.current,
        reservationId: ridRef.current,
        peerId,
      });
      handleCloseSummary();
    } finally {
      setSubmittingRating(false);
    }
  };

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) {
      log('toggleMic: NO audio track (posible NotReadable / sin permisos)');
      return;
    }
    track.enabled = !track.enabled;
    log('toggleMic', { enabled: track.enabled });
  }, [log]);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) {
      log('toggleCam: NO video track (posible NotReadable / sin permisos)');
      return;
    }
    track.enabled = !track.enabled;
    log('toggleCam', { enabled: track.enabled });
  }, [log]);

  const shareScreen = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      log('shareScreen: no PC');
      return;
    }

    try {
      log('shareScreen: getDisplayMedia()');
      const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
      });

      const vTrack = display.getVideoTracks()[0];
      if (!vTrack) {
        log('shareScreen: no video track from display');
        return;
      }

      const senders = pc.getSenders();
      const videoSender =
        senders.find((s) => s.track && s.track.kind === 'video') ||
        senders.find((s) => !s.track);

      if (!videoSender) {
        log('shareScreen: no video sender');
        return;
      }

      await videoSender.replaceTrack(vTrack);
      mediaReadyRef.current = true;
      log('shareScreen: track attached', {
        id: vTrack.id,
        label: vTrack.label,
      });

      if (
        initiatorRef.current &&
        wsReadyRef.current &&
        ackReadyRef.current &&
        peerPresentRef.current
      ) {
        (pc as any).__maybeNegotiate?.();
      }

      vTrack.onended = async () => {
        log('shareScreen: track ended, volviendo a cámara si existe');
        const cam = localStreamRef.current?.getVideoTracks()[0] || null;
        await videoSender.replaceTrack(cam);
      };
    } catch (e) {
      console.warn('[CALL] shareScreen error', e);
      alert('No se pudo compartir la pantalla. En algunos móviles/navegadores esta función no está soportada. Intenta desde un computador o actualiza tu navegador.');
    }
  }, [log]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    reconnectAttemptsRef.current = 0;
    start();

    return () => {
      cleanup();
    };
  }, [cleanup, start]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanup();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cleanup]);

  const fullscreenVideoStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        objectFit: 'contain',
        zIndex: 0,
        backgroundColor: '#000',
      }
    : {};

  return (
    <div
      className="call-page-container"
      ref={remoteContainerRef}
      onMouseMove={bumpUiVisible}
      onClick={bumpUiVisible}
      onTouchStart={bumpUiVisible}
      style={isFullscreen ? { backgroundColor: 'black' } : undefined}
    >
      <div
        className="call-header"
        style={{
          opacity: isFullscreen && !showUi ? 0 : 1,
          pointerEvents: isFullscreen && !showUi ? 'none' : 'auto',
          zIndex: 10,
        }}
      >
        <h1>Sesión de llamada</h1>
        <div className="call-meta">
          <div className="status-badge">
            <span
              className={`status-dot ${status === 'connected'
                ? 'connected'
                : status === 'failed' || status === 'closed'
                  ? 'failed'
                  : ''
                }`}
            />
            <span>{status}</span>
          </div>
          <CallChatButton />
        </div>
      </div>

      <div className="video-grid">
        <div className="remote-video-wrapper">
          <video
            ref={remoteVideoRef}
            className="remote-video"
            autoPlay
            playsInline
            style={isFullscreen ? fullscreenVideoStyle : undefined}
          />

          <button
            type="button"
            className="fullscreen-toggle"
            style={{
              opacity: isFullscreen && !showUi ? 0 : 1,
              pointerEvents: isFullscreen && !showUi ? 'none' : 'auto',
              zIndex: 20,
              position: isFullscreen ? 'fixed' : 'absolute',
              top: isFullscreen ? '16px' : '12px',
              right: isFullscreen ? '16px' : '12px'
            }}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
          >
            ⛶
          </button>

          <div
            className="local-video-wrapper"
            style={{
              zIndex: 15,
              position: isFullscreen ? 'fixed' : 'absolute',
              top: isFullscreen ? 'auto' : undefined,
              bottom: isFullscreen ? '16px' : undefined,
              right: isFullscreen ? '16px' : undefined,
            }}
          >
            <video
              ref={localVideoRef}
              className="local-video"
              autoPlay
              playsInline
              muted
            />
          </div>
        </div>
      </div>

      <div
        className="controls-dock"
        style={{
          opacity: isFullscreen && !showUi ? 0 : 1,
          pointerEvents: isFullscreen && !showUi ? 'none' : 'auto',
          zIndex: 10
        }}
      >
        <CallControls
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onShareScreen={shareScreen}
          onEnd={endCall}
        />
      </div>

      <audio
        ref={remoteAudioRef}
        style={{ display: 'none' }}
        autoPlay
        playsInline
      />

      {isChatOpen && chatContact && userId && token && (
        <aside className="chat-side-panel call-chat-panel" style={{ zIndex: 30 }}>
          <button
            className="close-chat-btn"
            onClick={() => setIsChatOpen(false)}
            type="button"
            aria-label="Cerrar chat"
          >
            ×
          </button>
          <ChatWindow contact={chatContact} myUserId={userId} token={token} />
        </aside>
      )}

      {showSummary && (
        <div className="call-summary-backdrop" style={{ zIndex: 50 }}>
          <div className="call-summary-card">
            <h2>Resumen de la llamada</h2>

            <p className="call-summary-duration">
              <strong>Duración de la llamada:</strong>{' '}
              {formatDuration(callDurationSec)}
            </p>

            {metrics && (
              <div className="call-summary-metrics">
                <h3>Calidad de conexión (últimos 5 minutos)</h3>
                <ul>
                  <li>
                    <strong>Conexión típica:</strong>{' '}
                    la mayoría de llamadas se conectan en aproximadamente{' '}
                    {(metrics.p95_ms / 1000).toFixed(1)} s (p95).
                  </li>
                  <li>
                    <strong>Estabilidad:</strong>{' '}
                    {(metrics.successRate5m * 100).toFixed(0)}% de las llamadas
                    recientes se conectan correctamente.
                  </li>
                  <li>
                    <strong>Muestras analizadas:</strong> {metrics.samples}
                  </li>
                </ul>
              </div>
            )}

            {canRateTutor && (
              <div className="call-summary-rating">
                <h3>Califica a tu tutor</h3>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= rating ? 'active' : ''}`}
                      onClick={() => setRating(star)}
                      aria-label={`${star} estrellas`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="¿Algo que quieras comentar sobre la tutoría?"
                  rows={3}
                />
              </div>
            )}

            {!canRateTutor && (
              <p style={{ marginTop: 12 }}>
                Esta reseña está pensada para que el estudiante califique al tutor.
                Solo verás el resumen de la llamada.
              </p>
            )}

            <div className="call-summary-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCloseSummary}
              >
                Volver sin calificar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitRating}
                disabled={submittingRating || (canRateTutor && rating === 0)}
              >
                {submittingRating ? 'Enviando…' : 'Guardar y volver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
