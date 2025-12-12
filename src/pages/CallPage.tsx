import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createCallSession,
  getIceServers,
  getCallMetrics,
  type CallMetrics,
  submitCallReview,
} from '../service/Api-call';
import CallChatButton from '../components/llamada/CallChatButton';
import CallControls from '../components/llamada/CallControls';
import '../styles/CallPage.css';
import '../styles/Chat.css';
import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatContact } from '../service/Api-chat';

type WsEnvelopeType =
  | 'JOIN' | 'JOIN_ACK' | 'OFFER' | 'ANSWER' | 'ICE_CANDIDATE'
  | 'RTC_CONNECTED' | 'HEARTBEAT' | 'PEER_JOINED' | 'PEER_LEFT' | 'END' | 'ERROR';

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

interface JoinAckPayload { initiator?: boolean; }

const wsProto = () => (globalThis.location.protocol === 'https:' ? 'wss' : 'ws');
const tuneOpusInSdp = (sdp?: string) => sdp ?? '';

function normalizeIceServers(raw: any): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const isOk = (u: string) => /^(stun:|turns?:)/i.test(u) && !u.trim().startsWith('#') && !u.trim().startsWith('//');

  const push = (u: string, src?: any) => {
    const url = (u || '').trim();
    if (!isOk(url)) return;
    const ice: RTCIceServer = { urls: url };
    if (src?.username) ice.username = src.username;
    if (src?.credential) ice.credential = src.credential;
    servers.push(ice);
  };

  const processEntry = (entry: any) => {
    if (typeof entry === 'string') {
      push(entry);
    } else if (entry && typeof entry === 'object') {
      const urls = entry.urls ?? entry.url;
      if (Array.isArray(urls)) {
        for (const u of urls) push(u, entry);
      } else if (typeof urls === 'string') {
        push(urls, entry);
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) processEntry(entry);
  } else {
    processEntry(raw);
  }

  if (!servers.length) servers.push({ urls: 'stun:stun.l.google.com:19302' });
  return servers;
}

type CallStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';
const MAX_RECONNECT_ATTEMPTS = 3;

function useCallLogic({
  token,
  userId,
  sessionId: sessionIdParam,
  reservationId: reservationIdParam,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onCallEnd,
}: {
  token: string;
  userId: string;
  sessionId?: string;
  reservationId?: string;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  onCallEnd: (duration: number | null) => void;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallStatus>('idle');
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdParam);
  const [reservationId, setReservationId] = useState<string | undefined>(reservationIdParam);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const sidRef = useRef<string | undefined>(sessionId);
  const ridRef = useRef<string | undefined>(reservationId);
  useEffect(() => { sidRef.current = sessionId; }, [sessionId]);
  useEffect(() => { ridRef.current = reservationId; }, [reservationId]);

  const log = useCallback((label: string, data?: any) => console.log('[CALL]', label, data ?? ''), []);

  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const initiatorRef = useRef(false);
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const peerPresentRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const ackReadyRef = useRef(false);
  const wsReadyRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const hasEverConnectedRef = useRef(false);
  const manualCloseRef = useRef(false);
  const callStartRef = useRef<number | null>(null);
  const [connectionDropped, setConnectionDropped] = useState(false);

  const cleanup = useCallback(() => {
    log('cleanup()');
    manualCloseRef.current = true;

    if (hbTimerRef.current) { clearInterval(hbTimerRef.current); hbTimerRef.current = null; }

    wsRef.current?.close();
    wsRef.current = null;

    if (pcRef.current) {
      for (const s of pcRef.current.getSenders()) s.track?.stop();
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      for (const t of remoteStreamRef.current.getTracks()) t.stop();
      remoteStreamRef.current = null;
    }

    setStatus('closed');
  }, [log]);

  const openSummaryAndMetrics = useCallback(() => {
    const duration = callStartRef.current ? Math.round((Date.now() - callStartRef.current) / 1000) : null;
    onCallEnd(duration);
    cleanup();
  }, [cleanup, onCallEnd]);

  const sendWs = useCallback((msg: Partial<WsEnvelope>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sidRef.current) return;
    const env: WsEnvelope = {
      type: msg.type as WsEnvelopeType,
      sessionId: sidRef.current,
      reservationId: ridRef.current,
      from: userId,
      ts: Date.now(),
      ...msg,
    } as WsEnvelope;
    try {
      ws.send(JSON.stringify(env));
      if (env.type !== 'HEARTBEAT') log('WS SEND', { type: env.type, sessionId: env.sessionId });
    } catch (e) {
      console.warn('[CALL] WS send failed', e);
    }
  }, [log, userId]);

  const maybeNegotiate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !initiatorRef.current || !wsReadyRef.current || !ackReadyRef.current || !peerPresentRef.current || !mediaReadyRef.current) return;
    if (pc.signalingState !== 'stable' || makingOfferRef.current) return;

    try {
      makingOfferRef.current = true;
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusInSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      sendWs({ type: 'OFFER', payload: pc.localDescription });
    } catch (e) {
      console.error('[CALL] Error creating offer', e);
    } finally {
      makingOfferRef.current = false;
    }
  }, [sendWs]);

  const acquireLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const constraints: MediaStreamConstraints = { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } };
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = media;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = media;
        localVideoRef.current.play().catch(e => console.warn('[CALL] local video play error', e));
      }
      return media;
    } catch (e) {
      console.error('[CALL] Error acquiring media', e);
      return null;
    }
  }, [localVideoRef]);

  const addTracksToPc = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const stream = await acquireLocalMedia();
    if (!stream) return;
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    mediaReadyRef.current = true;
    if (initiatorRef.current && wsReadyRef.current && ackReadyRef.current && peerPresentRef.current && pc.signalingState === 'stable') {
      maybeNegotiate();
    }
  }, [acquireLocalMedia, maybeNegotiate]);

  const handleJoinAck = useCallback(async (msg: WsEnvelope) => {
    initiatorRef.current = !!(msg.payload as JoinAckPayload)?.initiator;
    politeRef.current = !((msg.payload as JoinAckPayload)?.initiator);
    ackReadyRef.current = true;
    if (msg.sessionId) { setSessionId(msg.sessionId); sidRef.current = msg.sessionId; }
    if (msg.reservationId) { setReservationId(msg.reservationId); ridRef.current = msg.reservationId; }
    await addTracksToPc();
  }, [addTracksToPc]);

  const handlePeerJoined = useCallback(() => {
    peerPresentRef.current = true;
    setStatus('connecting');
    if (initiatorRef.current && mediaReadyRef.current) maybeNegotiate();
  }, [maybeNegotiate]);

  const handlePeerLeft = useCallback(() => {
    peerPresentRef.current = false;
    if (hasEverConnectedRef.current) {
      cleanup();
      setConnectionDropped(true);
    } else {
      setStatus('connecting');
    }
  }, [cleanup]);

  const handleOffer = useCallback(async (msg: WsEnvelope) => {
    const pc = pcRef.current;
    if (!pc) return;
    await addTracksToPc();
    const remoteDesc = msg.payload as RTCSessionDescriptionInit;
    const isGlare = remoteDesc.type === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');
    ignoreOfferRef.current = isGlare && !politeRef.current;
    if (ignoreOfferRef.current) return;
    if (isGlare && politeRef.current) await pc.setLocalDescription({ type: 'rollback' } as any);
    await pc.setRemoteDescription(remoteDesc);
    for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c);
    pendingCandidatesRef.current = [];
    const answer = await pc.createAnswer();
    answer.sdp = tuneOpusInSdp(answer.sdp);
    await pc.setLocalDescription(answer);
    sendWs({ type: 'ANSWER', payload: pc.localDescription });
  }, [addTracksToPc, sendWs]);

  const handleAnswer = useCallback(async (msg: WsEnvelope) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(msg.payload);
    for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c);
    pendingCandidatesRef.current = [];
  }, []);

  const handleIceCandidate = useCallback(async (msg: WsEnvelope) => {
    const pc = pcRef.current;
    if (!pc || ignoreOfferRef.current || !msg.payload) return;
    const candidate = new RTCIceCandidate(msg.payload);
    if (!pc.remoteDescription || pc.remoteDescription.type === 'rollback') {
      pendingCandidatesRef.current.push(candidate);
    } else {
      await pc.addIceCandidate(candidate).catch(e => console.error('[CALL] addIceCandidate error', e));
    }
  }, []);

  const onWsMessage = useCallback(async (ev: MessageEvent) => {
    const pc = pcRef.current;
    if (!pc) return;
    const msg: WsEnvelope = JSON.parse(ev.data);

    if (msg.type === 'ERROR') {
      console.error('[CALL] WS ERROR from server:', msg.payload);
      manualCloseRef.current = true;
      if (hasEverConnectedRef.current) {
        cleanup();
        setConnectionDropped(true);
      } else {
        setStatus('failed');
        wsRef.current?.close();
      }
      return;
    }

    if (msg.from === userId && msg.type !== 'JOIN_ACK') return;

    const handlers: { [k in WsEnvelopeType]?: (m: WsEnvelope) => void | Promise<void> } = {
      JOIN_ACK: handleJoinAck,
      PEER_JOINED: handlePeerJoined,
      PEER_LEFT: handlePeerLeft,
      OFFER: handleOffer,
      ANSWER: handleAnswer,
      ICE_CANDIDATE: handleIceCandidate,
      END: openSummaryAndMetrics,
    };

    const handler = handlers[msg.type];
    if (handler) await handler(msg);
  }, [cleanup, userId, handleJoinAck, handlePeerJoined, handlePeerLeft, handleOffer, handleAnswer, handleIceCandidate, openSummaryAndMetrics]);

  // ---- helpers para bajar complejidad de start ----
  const initPeer = useCallback(async () => {
    const rawIce = await getIceServers().catch(() => []);
    const pc = new RTCPeerConnection({ iceServers: normalizeIceServers(rawIce) });
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();

    pc.ontrack = (ev) => {
      remoteStreamRef.current!.addTrack(ev.track);
      if (remoteVideoRef.current && ev.track.kind === 'video') remoteVideoRef.current.srcObject = remoteStreamRef.current;
      if (remoteAudioRef.current && ev.track.kind === 'audio') remoteAudioRef.current.srcObject = remoteStreamRef.current;
    };
    pc.onicecandidate = (e) => { if (e.candidate) sendWs({ type: 'ICE_CANDIDATE', payload: e.candidate }); };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        if (!callStartRef.current) callStartRef.current = Date.now();
        hasEverConnectedRef.current = true;
        setStatus('connected');
        sendWs({ type: 'RTC_CONNECTED' });
      } else if (st === 'disconnected') setStatus('connecting');
      else if (st === 'failed') setStatus('failed');
    };
    pc.onnegotiationneeded = () => { void maybeNegotiate(); };

    await addTracksToPc();
  }, [addTracksToPc, maybeNegotiate, remoteAudioRef, remoteVideoRef, sendWs]);

  const initWebSocket = useCallback(async () => {
    const ws = new WebSocket(`${wsProto()}://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net/ws/call?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      wsReadyRef.current = true;
      reconnectAttemptsRef.current = 0;
      let sid = sidRef.current;
      if (!sid) {
        if (!ridRef.current) { console.error('[CALL] Missing reservationId'); return; }
        const created = await createCallSession(ridRef.current, token);
        sid = created.sessionId;
        setSessionId(sid);
        setReservationId(created.reservationId);
        sidRef.current = sid;
      }
      sendWs({ type: 'JOIN', sessionId: sid });
      hbTimerRef.current = setInterval(() => sendWs({ type: 'HEARTBEAT' }), 10000);
    };

    ws.onmessage = onWsMessage;
    ws.onerror = () => setStatus('failed');
    ws.onclose = () => {
      wsReadyRef.current = false;
      if (manualCloseRef.current) return;
      if (hbTimerRef.current) { clearInterval(hbTimerRef.current); hbTimerRef.current = null; }
      if (hasEverConnectedRef.current) {
        cleanup();
        setConnectionDropped(true);
        return;
      }
      if (++reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        setStatus('failed');
        navigate(-1);
      } else {
        setTimeout(() => { void start(); }, 2000);
      }
    };
  }, [cleanup, navigate, onWsMessage, sendWs, token]);

  const start = useCallback(async () => {
    setStatus('connecting');
    manualCloseRef.current = false;
    await initPeer();
    await initWebSocket();
  }, [initPeer, initWebSocket]);

  const endCall = useCallback(() => {
    sendWs({ type: 'END' });
    openSummaryAndMetrics();
  }, [openSummaryAndMetrics, sendWs]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) track.enabled = !track.enabled;
  }, []);

  const shareScreen = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenTrack);
        screenTrack.onended = async () => {
          const camTrack = localStreamRef.current?.getVideoTracks()[0] || null;
          await sender.replaceTrack(camTrack);
        };
      }
    } catch (e) {
      console.warn('[CALL] shareScreen error', e);
    }
  }, []);

  useEffect(() => {
    void start();
    const doCleanup = () => cleanup();
    window.addEventListener('beforeunload', doCleanup);
    return () => {
      doCleanup();
      window.removeEventListener('beforeunload', doCleanup);
    };
  }, [start, cleanup]);

  return { status, sessionId, reservationId, connectionDropped, endCall, toggleMic, toggleCam, shareScreen, callStartRef };
}

export default function CallPage() {
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const auth = useAuth();
  const token = useMemo(() => auth.user?.id_token || auth.user?.access_token || '', [auth.user]);
  const userId = useMemo(() => (auth.user?.profile as any)?.sub || '', [auth.user]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remoteContainerRef = useRef<HTMLElement | null>(null); // <section/>
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [callDurationSec, setCallDurationSec] = useState<number | null>(null);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const [rating, setRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [chatContact, setChatContact] = useState<ChatContact | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const { peerId, peerName, peerEmail, peerAvatar, role: callerRole } =
    (location.state || {}) as { peerId?: string; peerName?: string; peerEmail?: string; peerAvatar?: string; role?: 'student' | 'tutor'; };

  const onCallEnd = useCallback((duration: number | null) => {
    setCallDurationSec(duration);
    setShowSummary(true);
    getCallMetrics().then(setMetrics).catch(() => { });
  }, []);

  const { status, sessionId, reservationId, connectionDropped, endCall, toggleMic, toggleCam, shareScreen, callStartRef } =
    useCallLogic({
      token,
      userId,
      sessionId: sessionIdParam,
      reservationId: search.get('reservationId') || undefined,
      localVideoRef,
      remoteVideoRef,
      remoteAudioRef,
      onCallEnd,
    });

  useEffect(() => {
    if (!peerId || !userId || !token) return;
    setChatContact({ id: peerId, sub: peerId, name: peerName || 'Usuario', email: peerEmail || 'N/A', avatarUrl: peerAvatar });
  }, [peerId, peerName, peerEmail, peerAvatar, userId, token]);

  useEffect(() => {
    const handler = () => setIsChatOpen(true);
    globalThis.addEventListener('open-chat-drawer', handler as EventListener);
    return () => globalThis.removeEventListener('open-chat-drawer', handler as EventListener);
  }, []);

  const bumpUiVisible = useCallback(() => {
    setShowUi(true);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (document.fullscreenElement) {
      uiTimerRef.current = setTimeout(() => setShowUi(false), 3000);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = remoteContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => { });
    } else {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      setShowUi(true);
      if (!fs && uiTimerRef.current) {
        clearTimeout(uiTimerRef.current);
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
    const handle = () => bumpUiVisible();
    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown'] as const;
    for (const evt of events) document.addEventListener(evt, handle);
    return () => {
      for (const evt of events) document.removeEventListener(evt, handle);
    };
  }, [isFullscreen, bumpUiVisible]);

  const canRateTutor = callerRole === 'student';
  const formatMMSS = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const formatDuration = (sec: number | null): string => {
    if (!sec || sec <= 0) return 'No disponible (la llamada no llegó a conectarse)';
    const m = Math.floor(sec / 60); const s = sec % 60;
    return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
  };

  const handleCloseSummary = () => { setShowSummary(false); navigate(-1); };

  const handleSubmitRating = async () => {
    if (!canRateTutor) {
      handleCloseSummary();
      return;
    }

    if (!peerId || !reservationId) {
      console.warn('[CALL] Falta peerId o reservationId; no se puede guardar reseña');
      handleCloseSummary();
      return;
    }

    if (rating < 1 || rating > 5) {
      alert('Selecciona una calificación entre 1 y 5 estrellas.');
      return;
    }

    setSubmittingRating(true);
    try {
      await submitCallReview(token, {
        reservationId,
        tutorId: peerId,
        rating,
        comment: reviewComment.trim() || undefined,
      });

      alert('¡Gracias por tu reseña!');

      handleCloseSummary();
    } catch (e) {
      console.error('[CALL] Error guardando reseña', e);
      alert('No se pudo guardar la reseña. Intenta nuevamente más tarde.');
      handleCloseSummary();
    } finally {
      setSubmittingRating(false);
    }
  };

  useEffect(() => {
    if (status !== 'connected') return;
    if (!callStartRef.current) callStartRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (callStartRef.current as number)) / 1000);
      setLiveDurationSec(elapsed);
    }, 1000);
    return () => clearInterval(id);
  }, [status, callStartRef]);

  const statusDotClass = useMemo(() => {
    if (status === 'connected') return 'status-dot connected';
    if (status === 'failed' || status === 'closed') return 'status-dot failed';
    return 'status-dot';
  }, [status]);

  return (
    <section
      className="call-page-container"
      ref={remoteContainerRef}
      aria-label="Video call interface"
      /* NO tabindex ni listeners en elementos no interactivos (cumple S6845/S6847) */
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
            <span className={statusDotClass} />
            <span>{status}</span>
          </div>
          <div className="live-timer" aria-live="polite" title="Tiempo en llamada">
            ⏱ {formatMMSS(liveDurationSec)}
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
            aria-label="Video remoto (transmisión en vivo)"
            style={isFullscreen ? {
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              objectFit: 'contain', zIndex: 0, backgroundColor: '#000',
            } : undefined}
          >
            <track kind="captions" src="data:text/vtt;base64," label="(live)" />
          </video>

          <button
            type="button"
            className="fullscreen-toggle"
            style={{
              opacity: isFullscreen && !showUi ? 0 : 1,
              pointerEvents: isFullscreen && !showUi ? 'none' : 'auto',
              zIndex: 20,
              position: isFullscreen ? 'fixed' : 'absolute',
              bottom: isFullscreen ? '16px' : '12px',
              left: isFullscreen ? '16px' : '12px',
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
              bottom: isFullscreen ? '16px' : '12px',
              right: isFullscreen ? '16px' : '12px',
            }}
          >
            <video
              ref={localVideoRef}
              className="local-video"
              autoPlay
              playsInline
              muted
              aria-label="Mi cámara (PIP)"
            >
              <track kind="captions" src="data:text/vtt;base64," label="(live)" />
            </video>
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
        aria-label="Audio remoto"
      >
        <track kind="captions" src="data:text/vtt;base64," label="(live)" />
      </audio>

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
              <strong>Duración de la llamada:</strong> {formatDuration(callDurationSec)}
            </p>

            {metrics && (
              <div className="call-summary-metrics">
                <h3>Calidad de conexión (últimos 5 minutos)</h3>
                <ul>
                  <li><strong>Conexión típica:</strong> la mayoría de llamadas se conectan en aproximadamente {(metrics.p95_ms / 1000).toFixed(1)} s (p95).</li>
                  <li><strong>Estabilidad:</strong> {(metrics.successRate5m * 100).toFixed(0)}% de las llamadas recientes se conectan correctamente.</li>
                  <li><strong>Muestras analizadas:</strong> {metrics.samples}</li>
                </ul>
              </div>
            )}

            {callerRole === 'student' ? (
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
            ) : (
              <p style={{ marginTop: 12 }}>
                Esta reseña está pensada para que el estudiante califique al tutor.
                Solo verás el resumen de la llamada.
              </p>
            )}

            <div className="call-summary-actions">
              <button type="button" className="btn btn-ghost" onClick={handleCloseSummary}>
                Volver sin calificar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitRating}
                disabled={submittingRating || (callerRole === 'student' && rating === 0)}
              >
                {submittingRating ? 'Enviando…' : 'Guardar y volver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'closed' && connectionDropped && !showSummary && (
        <div className="call-summary-backdrop" style={{ zIndex: 60 }}>
          <div className="call-summary-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ marginBottom: '16px' }}>Llamada finalizada</h3>
            <p style={{ marginBottom: '24px', fontSize: '1.1rem', color: '#ccc' }}>
              Es posible que el otro usuario tuviera un fallo de conexión. Vuelve a intentarlo.
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(-1)}>
              Aceptar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
