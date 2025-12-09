import React, { useEffect, useRef, useState } from 'react';
import { ChatContact, ChatMessageData, getChatHistory, getChatIdWith, localStableChatId } from '../../service/Api-chat';
import { ChatSocket } from '../../service/ChatSocket';
import { ChatMessageBubble } from './ChatMessageBubble';

interface ChatWindowProps {
  contact: ChatContact;
  myUserId: string;
  token: string;
}

const cryptoRandomId = () => {
  try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); }
  catch { return `${Date.now()}-${Math.random()}`; }
};
const hash = (s: string) => {
  let h = 0; for (let i = 0; i < s.length; i++) h = Math.trunc(h * 31 + (s.codePointAt(i) ?? 0));
  return String(h);
};
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

const messageKey = (m: ChatMessageData) =>
  m.id && !m.id.startsWith('temp-')
    ? m.id
    : `${m.chatId}|${m.fromUserId}|${m.toUserId}|${hash(m.content)}|${m.createdAt.slice(0,19)}`; // recorta a segundos

const handleIncomingMessage = (
  incoming: unknown,
  chatIdRef: React.RefObject<string>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>,
  seenRef: React.RefObject<Set<string>>
) => {
  const raw = (incoming && typeof (incoming as { data?: unknown }).data === 'string')
    ? JSON.parse((incoming as MessageEvent).data as string)
    : incoming;
  const msg = mapAnyToServerShape(raw, chatIdRef.current || 'unknown');

  if (!chatIdRef.current || msg.chatId !== chatIdRef.current) return;

  setMessages(prev => {
    const idx = prev.findIndex(m =>
      m.id.startsWith('temp-') &&
      m.chatId === msg.chatId &&
      m.fromUserId === msg.fromUserId &&
      m.toUserId === msg.toUserId &&
      m.content === msg.content &&
      Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 5000
    );
    if (idx >= 0) {
      const clone = [...prev];
      clone[idx] = msg;
      seenRef.current?.add(messageKey(msg));
      return clone;
    }

    const k = messageKey(msg);
    if (seenRef.current?.has(k)) return prev;
    seenRef.current?.add(k);
    return [...prev, msg];
  });
};

const loadHistory = async (
  contactId: string,
  myUserId: string,
  token: string,
  chatIdRef: React.MutableRefObject<string>,
  seenRef: React.MutableRefObject<Set<string>>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>
) => {
  seenRef.current.clear();
  setMessages([]);

  let cid: string;
  try {
    cid = await getChatIdWith(contactId, token);
  } catch {
    cid = await localStableChatId(myUserId, contactId);
  }
  chatIdRef.current = cid;

  const hist = await getChatHistory(cid, token).catch(() => []);

  const cleaned: ChatMessageData[] = [];
  for (const h of (hist as any[])) {
    const m = mapAnyToServerShape(h, cid);
    const k = messageKey(m);
    if (!seenRef.current.has(k)) {
      seenRef.current.add(k);
      cleaned.push(m);
    }
  }
  cleaned.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  setMessages(cleaned);
};

export const ChatWindow: React.FC<ChatWindowProps> = ({ contact, myUserId, token }) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const socketRef = useRef<ChatSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string>('');
  const seenRef = useRef<Set<string>>(new Set()); 

  useEffect(() => {
    socketRef.current = new ChatSocket();
    socketRef.current.connect(
      token,
      (incoming: unknown) => handleIncomingMessage(incoming, chatIdRef, setMessages, seenRef),
      (state) => console.log(`Socket state: ${state}`)
    );
    return () => { socketRef.current?.disconnect(); socketRef.current = null; };
  }, [token]);

  useEffect(() => {
    let mounted = true;
    loadHistory(contact.id, myUserId, token, chatIdRef, seenRef, (newMessages) => {
      if (mounted) {
        setMessages(newMessages);
      }
    });
    return () => { mounted = false; };
  }, [contact.id, myUserId, token]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || !chatIdRef.current) return;

    const optimistic: ChatMessageData = {
      id: `temp-${cryptoRandomId()}`,
      chatId: chatIdRef.current,
      fromUserId: myUserId,
      toUserId: contact.id,
      content: text,
      createdAt: new Date().toISOString(),
      delivered: false,
      read: false,
    };

    const k = messageKey(optimistic);
    if (!seenRef.current.has(k)) {
      seenRef.current.add(k);
      setMessages(prev => [...prev, optimistic]);
    }

    socketRef.current?.sendMessage(contact.id, text);
    setNewMessage('');
  };

  return (
    <div className="chat-window">
      <div className="chat-window-header"><h4>{contact.name}</h4></div>

      <div className="chat-messages">
        {messages.map(m => (
          <ChatMessageBubble key={messageKey(m)} message={m} isMine={m.fromUserId === myUserId} />
        ))}
        <div ref={endRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          autoComplete="off"
        />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
};
