// src/pages/CallPage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from 'react-oidc-context';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { createCallSession, getIceServers } from '../service/Api-call';
import CallChatButton from '../components/llamada/CallChatButton';
import CallControls from '../components/llamada/CallControls';
import '../styles/CallPage.css';
 
/* ---------------------- Tipos de mensajes WS ---------------------- */
 
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
 
/* ---------------------- Utilidades WebRTC ---------------------- */
 
function wsProto() {
  return window.location.protocol === 'https:' ? 'wss' : 'ws';
}
 
/**
 * IMPORTANTE:
 * Dejamos el SDP tal cual lo genera el navegador.
 * Antes estábamos modificando parámetros Opus y eso puede generar audio trabado.
 */
function tuneOpusInSdp(sdp?: string) {
  return sdp ?? '';
}
 
/**
 * Normaliza ICE servers del backend
 */
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
 
/* ---------------------- Página de Llamada ---------------------- */
 
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
 
  // refs globales
  const sidRef = useRef<string | undefined>(sessionId);
  const ridRef = useRef<string | undefined>(reservationId);
  useEffect(() => {
    sidRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    ridRef.current = reservationId;
  }, [reservationId]);
 
  // refs media
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
 
  // WebRTC / WS
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioTxRef = useRef<RTCRtpTransceiver | null>(null);
  const videoTxRef = useRef<RTCRtpTransceiver | null>(null);
 
  // flags negociación
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
  const manualCloseRef = useRef(false); // true cuando es cierre “normal”
 
  const [debug, setDebug] = useState({
    signaling: 'new',
    ice: 'new',
    gathering: 'new',
    localTracks: { audio: 0, video: 0 },
    remoteTracks: { audio: 0, video: 0 },
    mediaError: '' as string | null,
  });
 
  const log = useCallback((label: string, data?: any) => {
    // eslint-disable-next-line no-console
    console.log('[CALL]', label, data ?? '');
  }, []);
 
  /* ---------------------- Limpieza ---------------------- */
 
  const cleanup = useCallback(() => {
    log('cleanup()');
 
    manualCloseRef.current = true; // marcamos que el cierre fue intencional
 
    if (hbTimerRef.current) {
      window.clearInterval(hbTimerRef.current);
      hbTimerRef.current = null;
    }
 
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
 
  /* ---------------------- Envío WS ---------------------- */
 
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
 
  /* ---------------------- PeerConnection ---------------------- */
 
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
      iceCandidatePoolSize: 2,
    });
    pcRef.current = pc;
 
    audioTxRef.current = pc.addTransceiver('audio', { direction: 'sendrecv' });
    videoTxRef.current = pc.addTransceiver('video', { direction: 'sendrecv' });
 
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
        // IMPORTANTE: el video remoto no debe sacar audio.
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
  }, [log, maybeNegotiate, notifyRtcConnected, sendWs]);
 
  /* ---------------------- Media local ---------------------- */
 
  const acquireLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
 
    try {
      // Audio simple: dejamos que el navegador elija el perfil adecuado.
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
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
      // no limpiamos; dejamos que reciba medios remotos
      return null;
    }
  }, [log]);
 
  const addTracksToPc = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
 
    await acquireLocalMedia();
    const stream = localStreamRef.current;
 
    if (!stream) {
      log('addTracksToPc: no localStream (solo recibirá medios)');
      return;
    }
 
    const a = stream.getAudioTracks()[0] || null;
    const v = stream.getVideoTracks()[0] || null;
 
    log('addTracksToPc: attaching tracks', {
      hasAudio: !!a,
      hasVideo: !!v,
    });
 
    if (audioTxRef.current && a) {
      await audioTxRef.current.sender.replaceTrack(a);
      audioTxRef.current.direction = 'sendrecv';
    }
    if (videoTxRef.current && v) {
      await videoTxRef.current.sender.replaceTrack(v);
      videoTxRef.current.direction = 'sendrecv';
    }
 
    mediaReadyRef.current = !!(a || v);
 
    setDebug((d) => ({
      ...d,
      localTracks: {
        audio: stream.getAudioTracks().length,
        video: stream.getVideoTracks().length,
      },
    }));
 
    if (initiatorRef.current && mediaReadyRef.current) {
      (pc as any).__maybeNegotiate?.();
    }
  }, [acquireLocalMedia, log]);
 
  /* ---------------------- Mensajes WebSocket ---------------------- */
 
  const onWsMessage = useCallback(
    async (ev: MessageEvent) => {
      const pc = pcRef.current;
      if (!pc) return;
 
      const msg: WsEnvelope = JSON.parse(ev.data);
      if (msg.type !== 'HEARTBEAT') {
        log('WS RECV', { type: msg.type, from: msg.from });
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
        setStatus('connecting');
        if (initiatorRef.current && mediaReadyRef.current) {
          (pc as any).__maybeNegotiate?.();
        }
        return;
      }
 
      if (msg.type === 'PEER_LEFT') {
        peerPresentRef.current = false;
        log('PEER_LEFT');
        setStatus('connecting');
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
 
        // procesar ICE pendiente
        if (pendingCandidatesRef.current.length > 0) {
          for (const c of pendingCandidatesRef.current) {
            // eslint-disable-next-line no-await-in-loop
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
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(msg.payload);
 
          if (pendingCandidatesRef.current.length > 0) {
            for (const c of pendingCandidatesRef.current) {
              // eslint-disable-next-line no-await-in-loop
              await pc.addIceCandidate(c).catch((e) =>
                console.error('[CALL] addIceCandidate queued error', e),
              );
            }
            pendingCandidatesRef.current = [];
          }
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
        // el otro finalizó la llamada
        cleanup();
        return;
      }
    },
    [addTracksToPc, cleanup, log, userId],
  );
 
  /* ---------------------- Inicio de la llamada ---------------------- */
 
  const start = useCallback(async () => {
    log('start()', {
      sessionIdParam,
      reservationIdParam: search.get('reservationId'),
    });
    setStatus('connecting');
 
    manualCloseRef.current = false;
 
    await buildPeer();
    await acquireLocalMedia();
 
    const ws = new WebSocket(
      `${wsProto()}://localhost:8093/ws/call?token=${encodeURIComponent(
        token,
      )}`,
    );
    wsRef.current = ws;
 
    ws.onopen = async () => {
      wsReadyRef.current = true;
      reconnectAttemptsRef.current = 0; // conexión establecida, reiniciamos contador
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
        reservationId: ridRef.current,
        from: userId,
        ts: Date.now(),
      };
      ws.send(JSON.stringify(joinMsg));
      log('JOIN sent', { sessionId: sid });
 
      hbTimerRef.current = window.setInterval(
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
        // cierre normal: no reconectamos
        return;
      }
 
      // cierre inesperado → intentamos reconectar
      if (hbTimerRef.current) {
        window.clearInterval(hbTimerRef.current);
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
        return;
      }
 
      setStatus('connecting');
      log('Scheduling reconnect', {
        attempt: reconnectAttemptsRef.current,
      });
 
      setTimeout(() => {
        if (!manualCloseRef.current) {
          start(); // reintenta un nuevo WS y nuevo PC
        }
      }, 2000);
    };
 
    ws.onerror = (e) => {
      console.error('[CALL] WS error', e);
      setStatus('failed');
    };
  }, [
    acquireLocalMedia,
    buildPeer,
    log,
    onWsMessage,
    sendWs,
    sessionIdParam,
    token,
    userId,
    search,
  ]);
 
  const endCall = useCallback(() => {
    // finaliza llamada de forma explícita
    sendWs({ type: 'END' });
    cleanup();
    navigate(-1); // vuelve a la página anterior
  }, [cleanup, navigate, sendWs]);
 
  /* ---------------------- Controles (mic/cam/share) ---------------------- */
 
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
    if (!pc || !videoTxRef.current?.sender) {
      log('shareScreen: no PC o no video sender');
      return;
    }
 
    try {
      log('shareScreen: getDisplayMedia()');
      const display: MediaStream = await (navigator.mediaDevices as any)
        .getDisplayMedia({
          video: true,
        });
 
      const vTrack = display.getVideoTracks()[0];
      if (!vTrack) {
        log('shareScreen: no video track from display');
        return;
      }
 
      await videoTxRef.current.sender.replaceTrack(vTrack);
      mediaReadyRef.current = true;
      log('shareScreen: track attached', {
        id: vTrack.id,
        label: vTrack.label,
      });
 
      if (initiatorRef.current) {
        (pc as any).__maybeNegotiate?.();
      }
 
      vTrack.onended = async () => {
        log('shareScreen: track ended, volviendo a cámara si existe');
        const cam = localStreamRef.current?.getVideoTracks()[0] || null;
        await videoTxRef.current?.sender.replaceTrack(cam);
      };
    } catch (e) {
      console.warn('[CALL] shareScreen error', e);
    }
  }, [log]);
 
  /* ---------------------- Efecto de montaje ---------------------- */
 
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
 
  /* ---------------------- Render ---------------------- */
 
  return (
    <div className="call-page-container">
      {/* Header flotante */}
      <div className="call-header">
        <h1>Sesión de llamada</h1>
        <div className="call-meta">
          <div className="status-badge">
            <span
              className={`status-dot ${
                status === 'connected'
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
 
      {/* Grid de video */}
      <div className="video-grid">
        <div className="remote-video-wrapper">
          <video
            ref={remoteVideoRef}
            className="remote-video"
            autoPlay
            playsInline
          />
          <div className="local-video-wrapper">
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
 
      {/* Dock de controles */}
      <div className="controls-dock">
        <CallControls
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onShareScreen={shareScreen}
          onEnd={endCall}
        />
      </div>
 
      {/* Audio remoto */}
      <audio
        ref={remoteAudioRef}
        style={{ display: 'none' }}
        autoPlay
        playsInline
      />
 
      {/* Panel de debug */}
      <div className="debug-panel">
        <strong>Debug</strong>
        <div>
          signaling: {debug.signaling} / ice: {debug.ice} / gathering:{' '}
          {debug.gathering}
        </div>
        <div>
          local: a{debug.localTracks.audio}v{debug.localTracks.video} / remote:
          a{debug.remoteTracks.audio}v{debug.remoteTracks.video}
        </div>
        {debug.mediaError && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#f87171' }}>
            mediaError: {debug.mediaError}
          </div>
        )}
      </div>
    </div>
  );
}
 
 