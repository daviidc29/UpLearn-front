import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  ChatContact,
  ChatMessageData,
  getChatHistory,
  getChatIdWith,
  localStableChatId,
} from '../../service/Api-chat';
import { ChatSocket, SocketState } from '../../service/ChatSocket';

interface ChatWindowProps {
  contact: ChatContact;
  myUserId: string;
  token: string;
  onClose?: () => void; 
}

const rndId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const resolveDate = (m: ChatMessageData) => new Date(m.createdAt || new Date().toISOString());

export const ChatWindow: React.FC<ChatWindowProps> = ({ contact, myUserId, token, onClose }) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [chatId, setChatId] = useState<string>('');

  const socketRef = useRef<ChatSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const isReady = historyLoaded && socketState === 'open' && chatId !== '';

  useEffect(() => {
    let mounted = true;
    setHistoryLoaded(false);
    setMessages([]);

    const initChat = async () => {
      try {
        let cid = '';
        try {
          cid = await getChatIdWith(contact.id, token);
        } catch {
          cid = await localStableChatId(myUserId, contact.id);
        }
        
        if (!mounted) return;
        setChatId(cid);

        const history = await getChatHistory(cid, token);
        if (!mounted) return;
        
        setMessages(prev => {
           const combined = [...prev, ...history];
           return combined;
        });
        setHistoryLoaded(true);
      } catch (e) {
        console.error("Error cargando chat:", e);
        if(mounted) setHistoryLoaded(true); 
      }
    };

    initChat();
    return () => { mounted = false; };
  }, [contact.id, myUserId, token]);

  useEffect(() => {
    if (socketRef.current) {
        socketRef.current.disconnect();
    }

    const socket = new ChatSocket();
    socketRef.current = socket;

    socket.connect(
      token,
      (incoming: any) => {
        const raw = (incoming && typeof incoming.data === 'string') ? JSON.parse(incoming.data) : incoming;
        
        const from = String(raw?.fromUserId ?? raw?.senderId ?? raw?.from ?? '');
        const to = String(raw?.toUserId ?? raw?.recipientId ?? raw?.to ?? '');
        
        const isRelated = (from === contact.id && to === myUserId) || (from === myUserId && to === contact.id);
        if (!isRelated) return;

        const msg: ChatMessageData = {
          id: String(raw.id ?? rndId()),
          chatId: String(raw.chatId ?? chatId),
          fromUserId: from,
          toUserId: to,
          content: String(raw.content ?? raw.text ?? ''),
          createdAt: raw.createdAt ?? new Date().toISOString(),
          delivered: true,
          read: false
        };

        setMessages(prev => [...prev, msg]);
      },
      (state) => setSocketState(state)
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [contact.id, myUserId, token, chatId]); 

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, historyLoaded, socketState]);

  const displayedMessages = useMemo(() => {
    const unique = new Map<string, ChatMessageData>();
    
    for (const m of messages) {
        const key = (m.id && !m.id.startsWith('temp-')) 
            ? m.id 
            : `${m.content}-${m.createdAt}-${m.fromUserId}`; 
        
        if (unique.has(key)) {
            const existing = unique.get(key)!;
            if (String(existing.id).startsWith('temp-') && !String(m.id).startsWith('temp-')) {
                unique.set(key, m);
            }
        } else {
            unique.set(key, m);
        }
    }

    return Array.from(unique.values()).sort((a, b) => 
      resolveDate(a).getTime() - resolveDate(b).getTime()
    );
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputText.trim();
    if (!val || !isReady) return;

    const tempMsg: ChatMessageData = {
      id: rndId(),
      chatId: chatId,
      fromUserId: myUserId,
      toUserId: contact.id,
      content: val,
      createdAt: new Date().toISOString(),
      delivered: false,
      read: false
    };

    setMessages(prev => [...prev, tempMsg]);
    socketRef.current?.sendMessage(contact.id, val, chatId);
    setInputText('');
  };

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
           <div className={`status-dot ${socketState === 'open' ? 'online' : 'offline'}`} />
           <h4>{contact.name}</h4>
        </div>
        {onClose && (
            <button onClick={onClose} className="close-chat-btn" type="button">×</button>
        )}
      </div>

      <div className="chat-messages">
        {!historyLoaded && <div className="loading-history">Cargando historial...</div>}
        
        {displayedMessages.map(m => {
           const isMine = m.fromUserId === myUserId;
           return (
             <div key={m.id} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
               <p>{m.content}</p>
               <span className="timestamp">
                 {resolveDate(m).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 {isMine && m.id.startsWith('temp-') && <span style={{marginLeft:4}}>🕒</span>}
               </span>
             </div>
           );
        })}
        <div ref={endRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={isReady ? "Escribe un mensaje..." : "Conectando..."}
          disabled={!isReady}
          autoComplete="off"
        />
        <button type="submit" disabled={!isReady || !inputText.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
};