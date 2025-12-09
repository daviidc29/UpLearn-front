import React, { useEffect, useRef, useState } from 'react';
import {
  ChatMessageData,
  getChatHistory,
  getChatIdWith,
  localStableChatId,
  ChatContact
} from '../../service/Api-chat';
import { ChatSocket } from '../../service/ChatSocket';

type Props = {
  contact: ChatContact;
  myUserId: string;
  token: string;
  onClose: () => void;
};

const isJwt = (t?: string) => !!t && t.split('.').length >= 3 && t.trim().length > 20;
const rndId = () => {
  try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); }
  catch { return `${Date.now()}-${Math.random()}`; }
};
const hash = (s: string) => { let h = 0; for (const ch of s) { h = Math.trunc(h * 31 + ch.codePointAt(0)!); } return String(h); };
const msgKey = (m: ChatMessageData) =>
  (m.id && !String(m.id).startsWith('temp-'))
    ? m.id
    : `${m.chatId}|${m.fromUserId}|${m.toUserId}|${hash(m.content)}|${m.createdAt.slice(0,19)}`;

const mapAnyToMsg = (raw: any, fallbackChatId: string): ChatMessageData => ({
  id: String(raw?.id ?? rndId()),
  chatId: String(raw?.chatId ?? fallbackChatId),
  fromUserId: String(raw?.fromUserId ?? raw?.from ?? ''),
  toUserId: String(raw?.toUserId ?? raw?.to ?? ''),
  content: String(raw?.content ?? ''),
  createdAt: String(raw?.createdAt ?? new Date().toISOString()),
  delivered: Boolean(raw?.delivered ?? false),
  read: Boolean(raw?.read ?? false),
});

const ChatBubble: React.FC<{ m: ChatMessageData; mine: boolean }> = ({ m, mine }) => {
  const cls = mine ? 'chat-bubble mine' : 'chat-bubble theirs';
  const ts = m.createdAt || new Date().toISOString();
  return (
    <div className={cls}>
      <p>{m.content}</p>
      <span className="timestamp">
        {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

const isOptimisticMatch = (optimistic: ChatMessageData, confirmed: ChatMessageData) =>
  String(optimistic.id).startsWith('temp-') &&
  optimistic.chatId === confirmed.chatId &&
  optimistic.fromUserId === confirmed.fromUserId &&
  optimistic.toUserId === confirmed.toUserId &&
  optimistic.content === confirmed.content &&
  Math.abs(new Date(optimistic.createdAt).getTime() - new Date(confirmed.createdAt).getTime()) < 5000;

export const ChatSidePanel: React.FC<Props> = ({ contact, myUserId, token, onClose }) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<ChatSocket | null>(null);
  const chatIdRef = useRef<string>('');
  const seenRef = useRef<Set<string>>(new Set());

  const handleIncomingMessage = (incoming: any) => {
    const m = mapAnyToMsg(incoming, chatIdRef.current || 'unknown');
    if (!chatIdRef.current || m.chatId !== chatIdRef.current) return;

    setMessages(prev => {
      const idx = prev.findIndex(x => isOptimisticMatch(x, m));
      if (idx >= 0) {
        const clone = [...prev]; clone[idx] = m;
        seenRef.current.add(msgKey(m));
        return clone;
      }
      const k = msgKey(m);
      if (seenRef.current.has(k)) return prev;
      seenRef.current.add(k);
      return [...prev, m];
    });
  };

  useEffect(() => {
    if (!isJwt(token)) return;
    const ws = new ChatSocket({ autoReconnect: true, pingIntervalMs: 20000 });
    socketRef.current = ws;
    ws.connect(token, handleIncomingMessage, () => {});
    return () => { ws.disconnect(); socketRef.current = null; };
  }, [token]);

  const loadChat = async (mountedRef: { current: boolean }) => {
    seenRef.current.clear();
    setMessages([]);
    let cid: string;
    try { cid = await getChatIdWith(contact.id, token); }
    catch { cid = await localStableChatId(myUserId, contact.id); }
    if (!mountedRef.current) return;
    chatIdRef.current = cid;

    const hist = await getChatHistory(cid, token).catch(() => []);
    if (!mountedRef.current) return;
    const cleaned: ChatMessageData[] = [];
    for (const h of (hist as any[])) {
      const m = mapAnyToMsg(h, cid);
      const k = msgKey(m);
      if (!seenRef.current.has(k)) {
        seenRef.current.add(k);
        cleaned.push(m);
      }
    }
    cleaned.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (mountedRef.current) {
      setMessages(cleaned);
    }
  };

  useEffect(() => {
    if (!isJwt(token)) return;
    const mountedRef = { current: true };
    loadChat(mountedRef);
    return () => { mountedRef.current = false; };
  }, [contact.id, myUserId, token]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !chatIdRef.current) return;

    const optimistic: ChatMessageData = {
      id: `temp-${rndId()}`,
      chatId: chatIdRef.current,
      fromUserId: myUserId,
      toUserId: contact.id,
      content: t,
      createdAt: new Date().toISOString(),
      delivered: false,
      read: false,
    };
    const k = msgKey(optimistic);
    if (!seenRef.current.has(k)) {
      seenRef.current.add(k);
      setMessages(prev => [...prev, optimistic]);
    }
    socketRef.current?.sendMessage(contact.id, t);
    setText('');
  };

  return (
    <div className="chat-side-panel">
      <div className="chat-window-header">
        <h4>{contact.name}</h4>
        <button onClick={onClose} className="close-chat-btn" type="button">×</button>
      </div>

      <div className="chat-messages">
        {messages.map(m => <ChatBubble key={msgKey(m)} m={m} mine={m.fromUserId === myUserId} />)}
        <div ref={endRef} />
      </div>

      <form className="chat-input-form" onSubmit={send}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Escribe un mensaje..." />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
};
