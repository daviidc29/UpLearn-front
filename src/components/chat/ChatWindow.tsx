import React, { useEffect, useRef, useState } from 'react';
import type { ChatContact } from '../../service/Api-chat';
import { useChatConversation } from './useChatConversation';

export const ChatWindow: React.FC<{
  contact: ChatContact;
  myUserId: string;
  token: string;
  onClose?: () => void;
}> = ({ contact, myUserId, token, onClose }) => {
  const [inputText, setInputText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const { messages, historyLoaded, socketState, canSend, send } =
    useChatConversation({
      myUserId,
      contactId: contact.id,
      token,
      onForceClose: onClose,
    });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' }); 
  }, [messages.length]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputText.trim();
    if (!val || !canSend) return;
    send(val);
    setInputText('');
  };

  const dotClass =
    socketState === 'open' ? 'online'
    : socketState === 'connecting' ? 'connecting'
    : 'offline';

  const placeholder =
    !historyLoaded ? 'Cargando historial...'
    : socketState === 'open' ? 'Escribe un mensaje...'
    : 'Reconectando... (puedes enviar, se encola)';

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div className={`status-dot ${dotClass}`} title={socketState} />
          <h4>{contact.name}</h4>
        </div>
        {onClose && (
          <button onClick={onClose} className="close-chat-btn" type="button">×</button>
        )}
      </div>

      <div className="chat-messages">
        {!historyLoaded && <div className="loading-history">Cargando historial...</div>}
        {messages.map(m => {
          const isMine = m.fromUserId === myUserId;
          const isTemp = String(m.id).startsWith('temp-') || (m as any).delivered === false;
          return (
            <div key={(m as any).clientMessageId ?? m.id} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
              <p>{m.content}</p>
              <span className="timestamp">
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {isMine && isTemp && <span style={{ marginLeft: 6, opacity: .7 }}>🕒</span>}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="chat-input-form" onSubmit={onSubmit}>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={placeholder}
          disabled={!historyLoaded}      
          autoComplete="off"
        />
        <button type="submit" disabled={!canSend || !inputText.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
};
