import React, { useEffect, useRef, useState } from 'react';
import { ChatContact, ChatMessageData, getChatHistory, getChatIdWith, localStableChatId } from '../../service/Api-chat';
import { ChatSocket } from '../../service/ChatSocket';
import { ChatMessageBubble } from './ChatMessageBubble';

interface ChatWindowProps {
  contact: ChatContact;
  myUserId: string;
  token: string;
}
/** Mapea cualquier objeto recibido */
const mapAnyToServerShape = (raw: any, fallbackChatId: string): ChatMessageData => ({
  id: String(raw?.id ?? cryptoRandomId()),
  chatId: String(raw?.chatId ?? fallbackChatId),
  fromUserId: String(raw?.fromUserId ?? raw?.senderId ?? raw?.from ?? raw?.userId ?? ''),
  toUserId: String(raw?.toUserId ?? raw?.recipientId ?? raw?.to ?? ''),
  content: String(raw?.content ?? raw?.text ?? ''),
  createdAt: String(raw?.createdAt ?? raw?.timestamp ?? new Date().toISOString()),
  delivered: Boolean(raw?.delivered ?? false),
  read: Boolean(raw?.read ?? false),
});
/** Genera ID estable localmente (sha256 de ambos IDs concatenados) */
function cryptoRandomId(): string {
  try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); }
  catch { return `${Date.now()}-${Math.random()}`; }
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ contact, myUserId, token }) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const socketRef = useRef<ChatSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string>(''); 

  useEffect(() => {
    socketRef.current = new ChatSocket();
    socketRef.current.connect(
      token,
      (incoming: unknown) => {
        const raw = (incoming && typeof (incoming as { data?: unknown }).data === 'string')
          ? JSON.parse((incoming as MessageEvent).data as string)
          : incoming;
        const msg = mapAnyToServerShape(raw, chatIdRef.current || 'unknown');

        // Solo mensajes del chat actual
        if (!chatIdRef.current || msg.chatId === chatIdRef.current) {
          setMessages(prev => [...prev, msg]);
        }
      },
      (state) => console.log(`Socket state: ${state}`)
    );
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Cargar chatId + historial cuando cambia el contacto
  useEffect(() => {
    let mounted = true;
    (async () => {
      let cid: string;
      try {
        cid = await getChatIdWith(contact.id, token);
      } catch {
        cid = await localStableChatId(myUserId, contact.id); 
        console.warn('getChatIdWith falló. Usando chatId local (sha256):', cid);
      }
      if (!mounted) return;
      chatIdRef.current = cid;
      chatIdRef.current = cid;
      const hist = await getChatHistory(cid, token).catch(() => []);
      if (!mounted) return;
      setMessages((hist as any[]).map(h => mapAnyToServerShape(h, cid)));
    })();
    return () => { mounted = false; };
  }, [contact.id, myUserId, token]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socketRef.current?.sendMessage(contact.id, newMessage);
    setNewMessage('');
  };

  return (
    <div className="chat-window">
      <div className="chat-window-header"><h4>{contact.name}</h4></div>
      <div className="chat-messages">
        {messages.map(m => (
          <ChatMessageBubble key={m.id} message={m} isMine={m.fromUserId === myUserId} />
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSend}>
        <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Escribe un mensaje..." />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
};