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
    for (const entry of raw) {
      processEntry(entry);
    }
  } else {
    processEntry(raw);
  }

  if (!servers.length) {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }
  return servers;
}

type CallStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

const MAX_RECONNECT_ATTEMPTS = 3;

// VTT mínimo embebido para cumplir regla de <track> (no interfiere con reproducción)
const VTT_DATA_URL =
  'data:text/vtt;base64,V0VCVlRUCgoxCjAwOjAwOjAwMC4wMDAgLS0+IDAwOjAwOjAxMC4wMDAKQXVkaW8gZW4gdml2bw==';

interface CallSummaryProps {
  readonly show: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (rating: number, comment: string) => Promise<void>;
  readonly callDurationSec: number | null;
  readonly metrics: CallMetrics | null;
  readonly callerRole?: 'student' | 'tutor';
  readonly peerId?: string;
}

function CallSummary({ show, onClose, onSubmit, callDurationSec, metrics, callerRole, peerId }: CallSummaryProps) {
  const [rating, setRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const canRateTutor = callerRole === 'student';

  const formatDuration = (sec: number | null): string => {
    if (!sec || sec <= 0) return 'No disponible (la llamada no llegó a conectarse)';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (!m) return `${s} s`;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
  };

  const handleSubmit = async () => {
    if (!canRateTutor) {
      onClose();
      return;
    }
    setSubmittingRating(true);
    try {
      await onSubmit(rating, reviewComment);
      onClose();
    } finally {
      setSubmittingRating(false);
    }
  };

  if (!show) return null;

  return (
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
        {canRateTutor && (
          <div className="call-summary-rating">
            <h3>Califica a tu tutor</h3>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" className={`star ${star <= rating ? 'active' : ''}`} onClick={() => setRating(star)} aria-label={`${star} estrellas`}>★</button>
              ))}
            </div>
            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="¿Algo que quieras comentar sobre la tutoría?" rows={3} />
          </div>
        )}
        {!canRateTutor && (
          <p style={{ marginTop: 12 }}>Esta reseña está pensada para que el estudiante califique al tutor. Solo verás el resumen de la llamada.</p>
        )}
        <div className="call-summary-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Volver sin calificar</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submittingRating || (canRateTutor && rating === 0)}>
            {submittingRating ? 'Enviando…' : 'Guardar y volver'}
          </button>
        </div>
      </div>
    </div>
  );
}

function useFullscreenAndUiVisibility(containerRef: React.RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiTimerRef = useRef<number | null>(null);

  const bumpUiVisible = useCallback(() => {
    setShowUi(true);
    if (uiTimerRef.current) {
      globalThis.clearTimeout(uiTimerRef.current);
      uiTimerRef.current = null;
    }
    if (document.fullscreenElement) {
      uiTimerRef.current = globalThis.setTimeout(() => setShowUi(false), 3000) as unknown as number;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const anyDoc = document as any;
    if (document.fullscreenElement) {
      anyDoc.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
        setShowUi(true);
        if (uiTimerRef.current) {
          globalThis.clearTimeout(uiTimerRef.current);
          uiTimerRef.current = null;
        }
      }).catch(() => {});
    } else {
      container.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
        setShowUi(true);
        bumpUiVisible();
      }).catch(() => {});
    }
  }, [containerRef, bumpUiVisible]);

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
    const handleUserActivity = () => bumpUiVisible();
    const doc = document;
    const events: (keyof DocumentEventMap)[] = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    for (const event of events) {
      doc.addEventListener(event, handleUserActivity);
    }
    return () => {
      for (const event of events) {
        doc.removeEventListener(event, handleUserActivity);
      }
    };
  }, [isFullscreen, bumpUiVisible]);

  return { isFullscreen, showUi, bumpUiVisible, toggleFullscreen };
}

interface CallPageUIProps {
  readonly status: CallStatus;
  readonly isFullscreen: boolean;
  readonly showUi: boolean;
  readonly isChatOpen: boolean;
  readonly showSummary: boolean;
  readonly chatContact: ChatContact | null;
  readonly userId: string;
  readonly token: string;
  readonly callDurationSec: number | null;
  readonly metrics: CallMetrics | null;
  readonly callerRole?: 'student' | 'tutor';
  readonly peerId?: string;
  readonly remoteContainerRef: React.RefObject<HTMLDivElement>;
  readonly localVideoRef: React.RefObject<HTMLVideoElement>;
  readonly remoteVideoRef: React.RefObject<HTMLVideoElement>;
  readonly remoteAudioRef: React.RefObject<HTMLAudioElement>;
  readonly bumpUiVisible: () => void;
  readonly handleContainerKeyDown: (e: React.KeyboardEvent) => void;
  readonly toggleFullscreen: () => void;
  readonly toggleMic: () => void;
  readonly toggleCam: () => void;
  readonly shareScreen: () => void;
  readonly endCall: () => void;
  readonly setIsChatOpen: (isOpen: boolean) => void;
  readonly handleCloseSummary: () => void;
  readonly handleSubmitRating: (rating: number, comment: string) => Promise<void>;
  readonly navigate: (to: number) => void;
}

function useFullscreenStyles(isFullscreen: boolean, showUi: boolean) {
  return useMemo(() => {
    const uiVisibilityStyle: React.CSSProperties = {
      opacity: isFullscreen && !showUi ? 0 : 1,
      pointerEvents: isFullscreen && !showUi ? 'none' : 'auto',
    };

    const containerStyle: React.CSSProperties | undefined = isFullscreen ? { backgroundColor: 'black' } : undefined;

    const videoStyle: React.CSSProperties = isFullscreen ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'contain', zIndex: 0, backgroundColor: '#000' } : {};

    const fullscreenButtonStyle: React.CSSProperties = {
      ...uiVisibilityStyle,
      zIndex: 20,
      position: isFullscreen ? 'fixed' : 'absolute',
      top: isFullscreen ? '16px' : '12px',
      right: isFullscreen ? '16px' : '12px',
    };

    const localVideoWrapperStyle: React.CSSProperties = {
      zIndex: 15,
      position: isFullscreen ? 'fixed' : 'absolute',
      top: isFullscreen ? 'auto' : undefined,
      bottom: isFullscreen ? '16px' : undefined,
      right: isFullscreen ? '16px' : undefined,
    };

    return { uiVisibilityStyle, containerStyle, videoStyle, fullscreenButtonStyle, localVideoWrapperStyle };
  }, [isFullscreen, showUi]);
}

function CallPageUI({
  status, isFullscreen, showUi, isChatOpen, showSummary, chatContact, userId, token, callDurationSec, metrics, callerRole, peerId,
  remoteContainerRef, localVideoRef, remoteVideoRef, remoteAudioRef,
  bumpUiVisible, handleContainerKeyDown, toggleFullscreen, toggleMic, toggleCam, shareScreen, endCall,
  setIsChatOpen, handleCloseSummary, handleSubmitRating, navigate,
}: CallPageUIProps) {
  const getStatusClass = (st: CallStatus) => {
    if (st === 'connected') return 'connected';
    if (st === 'failed' || st === 'closed') return 'failed';
    return '';
  };

  const { uiVisibilityStyle, containerStyle, videoStyle, fullscreenButtonStyle, localVideoWrapperStyle } = useFullscreenStyles(isFullscreen, showUi);

  return (
    <div
      className="call-page-container"
      ref={remoteContainerRef}
      onMouseMove={bumpUiVisible}
      onTouchStart={bumpUiVisible}
      role="button"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      aria-label="Área de llamada, muestra controles al interactuar"
      style={containerStyle}
    >
      <div className="call-header" style={{ ...uiVisibilityStyle, zIndex: 10 }}>
        <h1>Sesión de llamada</h1>
        <div className="call-meta">
          <div className="status-badge">
            <span className={`status-dot ${getStatusClass(status)}`} />
            <span>{status}</span>
          </div>
          <CallChatButton />
        </div>
      </div>

      <div className="video-grid">
        <div className="remote-video-wrapper">
          <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline muted style={videoStyle}>
            <track kind="captions" src={VTT_DATA_URL} srcLang="es" label="Vídeo remoto (silenciado)" />
          </video>
          <button type="button" className="fullscreen-toggle" style={fullscreenButtonStyle} onClick={toggleFullscreen} aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}>⛶</button>
          <div className="local-video-wrapper" style={localVideoWrapperStyle}>
            <video ref={localVideoRef} className="local-video" autoPlay playsInline muted>
              <track kind="captions" src={VTT_DATA_URL} srcLang="es" label="Vídeo local (silenciado)" />
            </video>
          </div>
        </div>
      </div>

      <div className="controls-dock" style={{ ...uiVisibilityStyle, zIndex: 10 }}>
        <CallControls onToggleMic={toggleMic} onToggleCam={toggleCam} onShareScreen={shareScreen} onEnd={endCall} />
      </div>

      <audio ref={remoteAudioRef} style={{ display: 'none' }} autoPlay aria-label="Audio remoto">
        <track kind="captions" src={VTT_DATA_URL} srcLang="es" label="Audio remoto (en vivo)" />
      </audio>

      {isChatOpen && chatContact && userId && token && (
        <aside className="chat-side-panel call-chat-panel" style={{ zIndex: 30 }}>
          <button className="close-chat-btn" onClick={() => setIsChatOpen(false)} type="button" aria-label="Cerrar chat">×</button>
          <ChatWindow contact={chatContact} myUserId={userId} token={token} />
        </aside>
      )}

      <CallSummary
        show={showSummary}
        onClose={handleCloseSummary}
        onSubmit={handleSubmitRating}
        callDurationSec={callDurationSec}
        metrics={metrics}
        callerRole={callerRole}
        peerId={peerId}
      />

      {status === 'closed' && !showSummary && (
        <div className="call-summary-backdrop" style={{ zIndex: 60 }}>
          <div className="call-summary-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ marginBottom: '16px' }}>Llamada finalizada</h3>
            <p style={{ marginBottom: '24px', fontSize: '1.1rem', color: '#ccc' }}>El otro usuario tuvo problemas con la conexión, inténtalo de nuevo.</p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(-1)}>Ok</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallPage() {
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const auth = useAuth();
  const token = useMemo(() => auth.user?.id_token || auth.user?.access_token || '', [auth.user]);
  const userId = useMemo(() => (auth.user?.profile as any)?.sub || (auth.user?.profile as any)?.userId || (auth.user?.profile as any)?.preferred_username || '', [auth.user]);

  const remoteContainerRef = useRef<HTMLDivElement | null>(null);
  const callStartRef = useRef<number | null>(null);
  const [callDurationSec, setCallDurationSec] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [chatContact, setChatContact] = useState<ChatContact | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const { peerId, peerName, peerEmail, peerAvatar, role: callerRole } = (location.state || {}) as { peerId?: string; peerName?: string; peerEmail?: string; peerAvatar?: string; role?: 'student' | 'tutor'; };
  const { isFullscreen, showUi, bumpUiVisible, toggleFullscreen } = useFullscreenAndUiVisibility(remoteContainerRef);

  const openSummaryAndMetrics = useCallback(() => {
    const now = Date.now();
    if (callStartRef.current && callDurationSec == null) {
      setCallDurationSec(Math.round((now - callStartRef.current) / 1000));
    }
    setShowSummary(true);
    getCallMetrics().then(setMetrics).catch(() => {});
  }, [callDurationSec]);

  const { status, localVideoRef, remoteVideoRef, remoteAudioRef, endCall, toggleMic, toggleCam, shareScreen } = useWebRTC({
    token,
    userId,
    sessionIdParam,
    reservationIdParam: search.get('reservationId'),
    onCallEnded: openSummaryAndMetrics,
    onConnected: () => { if (!callStartRef.current) callStartRef.current = Date.now(); },
  });

  useEffect(() => {
    if (peerId && userId && token) {
      setChatContact({ id: peerId, sub: peerId, name: peerName || 'Usuario', email: peerEmail || 'N/A', avatarUrl: peerAvatar });
    }
  }, [peerId, peerName, peerEmail, peerAvatar, userId, token]);

  useEffect(() => {
    const handler = () => setIsChatOpen(true);
    globalThis.addEventListener('open-chat-drawer', handler as EventListener);
    return () => globalThis.removeEventListener('open-chat-drawer', handler as EventListener);
  }, []);

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false);
    navigate(-1);
  }, [navigate]);

  const handleSubmitRating = useCallback(async (rating: number, comment: string) => {
    console.log('Rating enviado', { rating, comment, sessionId: 'N/A', reservationId: 'N/A', peerId });
  }, [peerId]);

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') bumpUiVisible();
  };

  return (
    <CallPageUI
      status={status}
      isFullscreen={isFullscreen}
      showUi={showUi}
      isChatOpen={isChatOpen}
      showSummary={showSummary}
      chatContact={chatContact}
      userId={userId}
      token={token}
      callDurationSec={callDurationSec}
      metrics={metrics}
      callerRole={callerRole}
      peerId={peerId}
      remoteContainerRef={remoteContainerRef}
      localVideoRef={localVideoRef}
      remoteVideoRef={remoteVideoRef}
      remoteAudioRef={remoteAudioRef}
      bumpUiVisible={bumpUiVisible}
      handleContainerKeyDown={handleContainerKeyDown}
      toggleFullscreen={toggleFullscreen}
      toggleMic={toggleMic}
      toggleCam={toggleCam}
      shareScreen={shareScreen}
      endCall={endCall}
      setIsChatOpen={setIsChatOpen}
      handleCloseSummary={handleCloseSummary}
      handleSubmitRating={handleSubmitRating}
      navigate={navigate}
    />
  );
}

interface UseWebRTCOptions {
  token: string;
  userId: string;
  sessionIdParam?: string;
  reservationIdParam?: string | null;
  onCallEnded: () => void;
  onConnected: () => void;
}

function useWebRTC({ token, userId, sessionIdParam, reservationIdParam, onCallEnded, onConnected }: UseWebRTCOptions) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallStatus>('idle');
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdParam);
  const [reservationId, setReservationId] = useState<string | undefined>(reservationIdParam || undefined);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const sidRef = useRef<string | undefined>(sessionId);
  const ridRef = useRef<string | undefined>(reservationId);
  useEffect(() => { sidRef.current = sessionId; }, [sessionId]);
  useEffect(() => { ridRef.current = reservationId; }, [reservationId]);

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

  const log = useCallback((label: string, data?: any) => {
    // eslint-disable-next-line no-console
    console.log('[CALL]', label, data ?? '');
  }, []);

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

  const cleanup = useCallback(() => {
    log('cleanup()');
    manualCloseRef.current = true;
    if (hbTimerRef.current) globalThis.clearInterval(hbTimerRef.current);
    if (reconnectWindowTimerRef.current) globalThis.clearTimeout(reconnectWindowTimerRef.current);
    if (reconnectCheckTimerRef.current) globalThis.clearInterval(reconnectCheckTimerRef.current);
    hbTimerRef.current = null;
    reconnectWindowTimerRef.current = null;
    reconnectCheckTimerRef.current = null;
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
      for (const s of pcRef.current.getSenders()) if (s.track) s.track.stop();
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

  const notifyRtcConnected = useCallback(() => {
    if (sentRtcConnectedRef.current) return;
    sentRtcConnectedRef.current = true;
    sendWs({ type: 'RTC_CONNECTED' });
  }, [sendWs]);

  const maybeNegotiate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !initiatorRef.current || !wsReadyRef.current || !ackReadyRef.current || !peerPresentRef.current || !mediaReadyRef.current || pc.signalingState !== 'stable' || makingOfferRef.current) return;
    try {
      makingOfferRef.current = true;
      log('maybeNegotiate: createOffer()', { signaling: pc.signalingState });
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

  const acquireLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: isMobile ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = media;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = media;
        localVideoRef.current.play().catch((e) => console.warn('[CALL] local video play error', e));
      }
      return media;
    } catch (e) {
      console.error('[CALL] Error acquiring media', e);
      return null;
    }
  }, []);

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
      const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      if (!track) return;
      let sender = senders.find((s) => s.track && s.track.kind === kind);
      if (sender) sender.replaceTrack(track);
      else pc.addTrack(track, stream);
    };
    attach('audio');
    attach('video');
    mediaReadyRef.current = stream.getAudioTracks().length > 0 || stream.getVideoTracks().length > 0;
    if (initiatorRef.current && mediaReadyRef.current && wsReadyRef.current && ackReadyRef.current && peerPresentRef.current && pc.signalingState === 'stable') {
      (pc as any).__maybeNegotiate?.();
    }
  }, [acquireLocalMedia, log]);

  const buildPeer = useCallback(async () => {
    const iceServers = normalizeIceServers(await getIceServers().catch(() => []));
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', iceTransportPolicy: 'all', iceCandidatePoolSize: 2 });
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();
    pc.ontrack = (ev) => {
      const stream = remoteStreamRef.current!;
      if (!stream.getTracks().some((t) => t.id === ev.track.id)) stream.addTrack(ev.track);
      if (remoteVideoRef.current && ev.track.kind === 'video') remoteVideoRef.current.srcObject = stream;
      if (remoteAudioRef.current && ev.track.kind === 'audio') remoteAudioRef.current.srcObject = stream;
    };
    pc.onicecandidate = (e) => { if (wsReadyRef.current && ackReadyRef.current && e.candidate) sendWs({ type: 'ICE_CANDIDATE', payload: e.candidate }); };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        hasEverConnectedRef.current = true;
        if (isReconnecting) {
          setIsReconnecting(false);
          if (reconnectWindowTimerRef.current) globalThis.clearTimeout(reconnectWindowTimerRef.current);
          if (reconnectCheckTimerRef.current) globalThis.clearInterval(reconnectCheckTimerRef.current);
          reconnectWindowTimerRef.current = null;
          reconnectCheckTimerRef.current = null;
        }
        setStatus('connected');
        onConnected();
        notifyRtcConnected();
      } else if (st === 'disconnected') setStatus('connecting');
      else if (st === 'failed') setStatus('failed');
    };
    pc.onnegotiationneeded = () => { maybeNegotiate(); };
    (pc as any).__maybeNegotiate = maybeNegotiate;
    return pc;
  }, [isReconnecting, maybeNegotiate, notifyRtcConnected, onConnected, sendWs]);

  const handleJoinAck = useCallback(async (msg: WsEnvelope) => {
    const payload = (msg.payload || {}) as JoinAckPayload;
    initiatorRef.current = !!payload.initiator;
    politeRef.current = !payload.initiator;
    ackReadyRef.current = true;
    if (msg.sessionId) setSessionId(msg.sessionId);
    if (msg.reservationId) setReservationId(msg.reservationId);
    await addTracksToPc();
  }, [addTracksToPc]);

  const handlePeerJoined = useCallback(() => {
    peerPresentRef.current = true;
    if (reconnectWindowTimerRef.current) globalThis.clearTimeout(reconnectWindowTimerRef.current);
    if (reconnectCheckTimerRef.current) globalThis.clearInterval(reconnectCheckTimerRef.current);
    reconnectWindowTimerRef.current = null;
    reconnectCheckTimerRef.current = null;
    if (isReconnecting) setIsReconnecting(false);
    setStatus('connecting');
    if (initiatorRef.current && mediaReadyRef.current) (pcRef.current as any)?.__maybeNegotiate?.();
  }, [isReconnecting]);

  const handlePeerLeft = useCallback(() => {
    peerPresentRef.current = false;
    if (hasEverConnectedRef.current && !isReconnecting) {
      setIsReconnecting(true);
      setStatus('connecting');
      if (reconnectWindowTimerRef.current) globalThis.clearTimeout(reconnectWindowTimerRef.current);
      if (reconnectCheckTimerRef.current) globalThis.clearInterval(reconnectCheckTimerRef.current);
      reconnectCheckTimerRef.current = globalThis.setInterval(() => log('Esperando reconexión...'), 6000) as any;
      reconnectWindowTimerRef.current = globalThis.setTimeout(() => {
        if (reconnectCheckTimerRef.current) globalThis.clearInterval(reconnectCheckTimerRef.current);
        reconnectWindowTimerRef.current = null;
        setIsReconnecting(false);
        cleanup();
        globalThis.alert('El otro usuario no pudo reconectarse.');
        navigate(-1);
      }, 120000) as any;
    } else {
      setStatus('connecting');
    }
  }, [cleanup, isReconnecting, log, navigate]);

  const handleOffer = useCallback(async (msg: WsEnvelope) => {
    await addTracksToPc();
    const pc = pcRef.current!;
    const remote: RTCSessionDescriptionInit = msg.payload;
    const glare = remote.type === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');
    ignoreOfferRef.current = glare && !politeRef.current;
    if (ignoreOfferRef.current) return;
    if (glare && politeRef.current) await pc.setLocalDescription({ type: 'rollback' } as any);
    await pc.setRemoteDescription(remote);
    for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c).catch(e => console.error(e));
    pendingCandidatesRef.current = [];
    const answer = await pc.createAnswer();
    answer.sdp = tuneOpusInSdp(answer.sdp);
    await pc.setLocalDescription(answer);
    sendWs({ type: 'ANSWER', payload: pc.localDescription });
  }, [addTracksToPc, sendWs]);

  const handleAnswer = useCallback(async (msg: WsEnvelope) => {
    const pc = pcRef.current!;
    try {
      await pc.setRemoteDescription(msg.payload);
      for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c).catch(e => console.error(e));
      pendingCandidatesRef.current = [];
    } catch (e) { console.error('[CALL] Error applying ANSWER', e); }
  }, []);

  const handleIceCandidate = useCallback(async (msg: WsEnvelope) => {
    const pc = pcRef.current!;
    if (ignoreOfferRef.current || !msg.payload) return;
    const candidate = new RTCIceCandidate(msg.payload);
    if (!pc.remoteDescription || pc.remoteDescription.type === 'rollback') pendingCandidatesRef.current.push(candidate);
    else await pc.addIceCandidate(candidate).catch(e => console.error(e));
  }, []);

  const onWsMessage = useCallback(async (ev: MessageEvent) => {
    if (!pcRef.current) return;
    const msg: WsEnvelope = JSON.parse(ev.data);
    if (msg.type === 'ERROR') {
      console.error('[CALL] WS ERROR:', msg.payload?.message || 'Error desconocido');
      manualCloseRef.current = true;
      setStatus('failed');
      wsRef.current?.close();
      return;
    }
    if (msg.from === userId && msg.type !== 'JOIN_ACK') return;
    if (msg.sessionId && sidRef.current && msg.sessionId !== sidRef.current && msg.type !== 'JOIN_ACK') return;
    switch (msg.type) {
      case 'JOIN_ACK': await handleJoinAck(msg); break;
      case 'PEER_JOINED': handlePeerJoined(); break;
      case 'PEER_LEFT': handlePeerLeft(); break;
      case 'OFFER': await handleOffer(msg); break;
      case 'ANSWER': await handleAnswer(msg); break;
      case 'ICE_CANDIDATE': await handleIceCandidate(msg); break;
      case 'END': cleanup(); onCallEnded(); break;
      default: break;
    }
  }, [userId, handleJoinAck, handlePeerJoined, handlePeerLeft, handleOffer, handleAnswer, handleIceCandidate, cleanup, onCallEnded]);

  const start = useCallback(async () => {
    setStatus('connecting');
    manualCloseRef.current = false;
    await buildPeer();
    await addTracksToPc();
    const ws = new WebSocket(`${wsProto()}://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net/ws/call?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onopen = async () => {
      wsReadyRef.current = true;
      reconnectAttemptsRef.current = 0;
      let sid = sidRef.current;
      if (!sid) {
        if (!ridRef.current) { console.error('[CALL] Falta reservationId'); return; }
        const created = await createCallSession(ridRef.current, token);
        sid = created.sessionId;
        setSessionId(sid);
        setReservationId(created.reservationId);
      }
      ws.send(JSON.stringify({ type: 'JOIN', sessionId: sid, reservationId: ridRef.current, from: userId, ts: Date.now() }));
      hbTimerRef.current = globalThis.setInterval(() => sendWs({ type: 'HEARTBEAT' }), 10_000) as any;
    };
    ws.onmessage = onWsMessage;
    ws.onclose = () => {
      wsRef.current = null;
      wsReadyRef.current = false;
      if (manualCloseRef.current) return;
      if (hbTimerRef.current) globalThis.clearInterval(hbTimerRef.current);
      hbTimerRef.current = null;
      if (pcRef.current) {
        for (const s of pcRef.current.getSenders()) if (s.track) s.track.stop();
        pcRef.current.close();
        pcRef.current = null;
      }
      remoteStreamRef.current = null;
      mediaReadyRef.current = !!localStreamRef.current;
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        setStatus('failed');
        globalThis.alert('No se pudo reconectar. Inténtalo de nuevo.');
        navigate(-1);
        return;
      }
      setStatus('connecting');
      globalThis.setTimeout(() => { if (!manualCloseRef.current) start(); }, 2000);
    };
    ws.onerror = (e) => { console.error('[CALL] WS error', e); setStatus('failed'); };
  }, [addTracksToPc, buildPeer, onWsMessage, sendWs, token, userId, navigate]);

  const endCall = useCallback(() => {
    sendWs({ type: 'END' });
    cleanup();
    onCallEnded();
  }, [sendWs, cleanup, onCallEnded]);

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
      const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      const vTrack = display.getVideoTracks()[0];
      if (!vTrack) return;
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video') || pc.getSenders().find(s => !s.track);
      if (!videoSender) return;
      await videoSender.replaceTrack(vTrack);
      mediaReadyRef.current = true;
      if (initiatorRef.current && wsReadyRef.current && ackReadyRef.current && peerPresentRef.current) (pc as any).__maybeNegotiate?.();
      vTrack.onended = async () => {
        const cam = localStreamRef.current?.getVideoTracks()[0] || null;
        await videoSender.replaceTrack(cam);
      };
    } catch (e) {
      console.warn('[CALL] shareScreen error', e);
      globalThis.alert('No se pudo compartir la pantalla.');
    }
  }, []);

  useEffect(() => {
    if (startedRef.current || !token || !userId) return;
    startedRef.current = true;
    reconnectAttemptsRef.current = 0;
    start();
    const doCleanup = () => cleanup();
    globalThis.addEventListener('beforeunload', doCleanup);
    return () => {
      doCleanup();
      globalThis.removeEventListener('beforeunload', doCleanup);
    };
  }, [cleanup, start, token, userId]);

  return { status, localVideoRef, remoteVideoRef, remoteAudioRef, endCall, toggleMic, toggleCam, shareScreen };
}
