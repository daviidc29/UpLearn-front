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
const rndId = () => { try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); } catch { return `${Date.now()}-${Math.random()}`; } };
const hash = (s: string) => { let h = 0; for (const ch of s) { h = Math.trunc(h * 31 + ch.codePointAt(0)!); } return String(h); };
const msgKey = (m: ChatMessageData) =>
    (m.id && !String(m.id).startsWith('temp-'))
        ? m.id
        : `${m.chatId}|${m.fromUserId}|${m.toUserId}|${hash(m.content)}|${m.createdAt.slice(0, 19)}`;

const mapAnyToMsg = (raw: any, fallbackChatId: string): ChatMessageData => ({
    id: String(raw?.id ?? rndId()),
    chatId: String(raw?.chatId ?? fallbackChatId),
    fromUserId: String(raw?.fromUserId ?? raw?.senderId ?? raw?.from ?? raw?.userId ?? ''),
    toUserId: String(raw?.toUserId ?? raw?.recipientId ?? raw?.to ?? ''),
    content: String(raw?.content ?? raw?.text ?? ''),
    createdAt: String(raw?.createdAt ?? raw?.timestamp ?? new Date().toISOString()),
    delivered: Boolean(raw?.delivered ?? false),
    read: Boolean(raw?.read ?? false),
});

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
    const [historyLoaded, setHistoryLoaded] = useState(false);   // ⬅️ NUEVO
    const endRef = useRef<HTMLDivElement>(null);

    const socketRef = useRef<ChatSocket | null>(null);
    const chatIdRef = useRef<string>('');
    const seenRef = useRef<Set<string>>(new Set());
    const pendingRef = useRef<ChatMessageData[]>([]);

    const handleIncomingMessage = (incoming: any) => {
        const m = mapAnyToMsg(incoming, chatIdRef.current || 'unknown');

        const participantsMatch =
            (m.fromUserId === myUserId && m.toUserId === contact.id) ||
            (m.fromUserId === contact.id && m.toUserId === myUserId);

        if (!chatIdRef.current) {
            if (participantsMatch) pendingRef.current.push(m);
            return;
        }
        if (m.chatId !== chatIdRef.current && !participantsMatch) return;

        setMessages(prev => {
            const k = msgKey(m);
            if (seenRef.current.has(k)) return prev;
            seenRef.current.add(k);

            const idx = prev.findIndex(x => isOptimisticMatch(x, m));
            if (idx >= 0) { const clone = [...prev]; clone[idx] = m; return clone; }

            return [...prev, m];
        });
    };

    useEffect(() => {
        if (!isJwt(token)) return;

        const ws = new ChatSocket({ autoReconnect: true, pingIntervalMs: 20000 });
        socketRef.current = ws;

        const offMsg = ws.subscribe(handleIncomingMessage);

        ws.connect(token);

        return () => {
            offMsg();           
            ws.disconnect();
            socketRef.current = null;
        };
    }, [token, myUserId, contact.id]);

    const loadChat = async (mountedRef: { current: boolean }) => {
        seenRef.current.clear();
        setMessages([]);
        setHistoryLoaded(false);                                   

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

        const pend = pendingRef.current.splice(0);
        for (const p of pend) {
            const match =
                p.chatId === cid ||
                ((p.fromUserId === myUserId && p.toUserId === contact.id) ||
                    (p.fromUserId === contact.id && p.toUserId === myUserId));
            if (match) {
                const k = msgKey(p);
                if (!seenRef.current.has(k)) { seenRef.current.add(k); cleaned.push(p); }
            }
        }

        cleaned.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        if (mountedRef.current) {
            setMessages(cleaned);
            setHistoryLoaded(true);
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
        if (!t || !chatIdRef.current || !historyLoaded) return;

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
        socketRef.current?.sendMessage(contact.id, t, chatIdRef.current);
        setText('');
    };

    return (
        <div className="chat-side-panel">
            <button onClick={onClose} className="close-chat-btn" type="button" aria-label="Cerrar chat">×</button>

            <div className="chat-window">
                <div className="chat-window-header">
                    <h4>{contact.name}</h4>
                </div>

                <div className="chat-messages">
                    {messages.map(m => (
                        <div key={msgKey(m)} className={m.fromUserId === myUserId ? 'chat-bubble mine' : 'chat-bubble theirs'}>
                            <p>{m.content}</p>
                            <span className="timestamp">
                                {new Date(m.createdAt || new Date().toISOString()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>

                <form className="chat-input-form" onSubmit={send}>
                    <input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={historyLoaded ? 'Escribe un mensaje...' : 'Cargando historial...'}
                    />
                    <button type="submit" disabled={!historyLoaded || !text.trim()}>
                        Enviar
                    </button>
                </form>
            </div>
        </div>
    );
};
