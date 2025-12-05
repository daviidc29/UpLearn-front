import React, { useState } from 'react';

type Props = {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onShareScreen: () => void;
  onEnd: () => void;
};

export default function CallControls({ onToggleMic, onToggleCam, onShareScreen, onEnd }: Readonly<Props>) {
  // Estados locales para iconos
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  const handleMic = () => {
    setMicOn(!micOn);
    onToggleMic();
  };

  const handleCam = () => {
    setCamOn(!camOn);
    onToggleCam();
  };

  const handleShare = () => {
    setSharing(!sharing);
    onShareScreen();
  };

  return (
    <div className="call-controls-group">
      <button 
        onClick={handleMic} 
        className={`call-btn ${micOn ? '' : 'off'}`}
        title={micOn ? "Apagar micrófono" : "Encender micrófono"}
      >
        {micOn ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M19 10v2a7 7 0 0 1-2.9 5.69M5 10v2a7 7 0 0 0 11.08 5.76"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        )}
      </button>

      <button 
        onClick={handleCam} 
        className={`call-btn ${camOn ? '' : 'off'}`}
        title={camOn ? "Apagar cámara" : "Encender cámara"}
      >
        {camOn ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>
        )}
      </button>

      <button 
        onClick={handleShare} 
        className={`call-btn ${sharing ? 'active-share' : ''}`}
        title="Compartir pantalla"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="m16 8-4-4-4 4"/></svg>
      </button>

      <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 4px', height: '32px' }}></div>

      <button 
        onClick={onEnd} 
        className="call-btn danger"
        title="Finalizar llamada"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
      </button>
    </div>
  );
}