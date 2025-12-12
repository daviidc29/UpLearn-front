import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  const processedIdsRef = useRef<Set<string>>(new Set()); 

  const isReady = historyLoaded && socketState === 'open' && chatId !== '';

  const addMessages = useCallback((newMsgs: ChatMessageData[]) => {
    setMessages(prev => {
      const next = [...prev];
      let changed = false;

      for (const m of newMsgs) {
        if (m.id && !m.id.startsWith('temp-') && processedIdsRef.current.has(m.id)) {
          continue;
        }

        if (m.id && !m.id.startsWith('temp-')) {
            processedIdsRef.current.add(m.id);
            
            const tempIndex = next.findIndex(existing => 
                existing.id.startsWith('temp-') && 
                existing.content === m.content && 
                existing.fromUserId === m.fromUserId &&
                Math.abs(resolveDate(existing).getTime() - resolveDate(m).getTime()) < 10000 // 10 seg de margen
            );

            if (tempIndex !== -1) {
                next[tempIndex] = m;
                changed = true;
                continue; 
            }
        }

        const exists = next.some(ex => ex.id === m.id);
        if (!exists) {
            next.push(m);
            changed = true;
        }
      }

      if (!changed) return prev;
      
      return next.sort((a, b) => resolveDate(a).getTime() - resolveDate(b).getTime());
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    setHistoryLoaded(false);
    setMessages([]);
    processedIdsRef.current.clear();
    setChatId('');

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

        addMessages(history);
        setHistoryLoaded(true);

      } catch (e) {
        console.error("Error cargando chat:", e);
        if(mounted) setHistoryLoaded(true); 
      }
    };

    initChat();
    return () => { mounted = false; };
  }, [contact.id, myUserId, token, addMessages]);

  useEffect(() => {
    if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
    }

    const socket = new ChatSocket({ autoReconnect: true });
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

        addMessages([msg]);
      },
      (state) => setSocketState(state)
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [contact.id, myUserId, token, chatId, addMessages]); 

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, historyLoaded]);


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

    addMessages([tempMsg]);
    setInputText('');

    socketRef.current?.sendMessage(contact.id, val, chatId);
  };

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
           <div className={`status-dot ${socketState === 'open' ? 'online' : 'offline'}`} 
                title={socketState === 'open' ? 'Conectado' : 'Desconectado'} />
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
           return (
             <div key={m.id} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
               <p>{m.content}</p>
               <span className="timestamp">
                 {resolveDate(m).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 {isMine && m.id.startsWith('temp-') && <span style={{marginLeft:4, opacity: 0.7}}>🕒</span>}
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