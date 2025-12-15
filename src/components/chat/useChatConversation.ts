import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessageData, getChatHistory, getChatIdWith, localStableChatId } from '../../service/Api-chat';
import { getSharedChatSocket } from '../../service/chatSocketSingleton';
import type { SocketState } from '../../service/ChatSocket';

const rnd = () => {
    try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); }
    catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
};

const hash = (s: string) => {
    let h = 0;
    for (const ch of s) h = Math.trunc(h * 31 + (ch.codePointAt(0) || 0));
    return String(h);
};

function mapRaw(raw: any, fallbackChatId: string): ChatMessageData & { clientMessageId?: string } {
    return {
        id: String(raw?.id ?? raw?.messageId ?? `srv-${rnd()}`),
        chatId: String(raw?.chatId ?? fallbackChatId),
        fromUserId: String(raw?.fromUserId ?? raw?.senderId ?? raw?.from ?? raw?.userId ?? ''),
        toUserId: String(raw?.toUserId ?? raw?.recipientId ?? raw?.to ?? ''),
        content: String(raw?.content ?? raw?.text ?? ''),
        createdAt: String(raw?.createdAt ?? raw?.timestamp ?? new Date().toISOString()),
        delivered: Boolean(raw?.delivered ?? true),
        read: Boolean(raw?.read ?? false),
        clientMessageId: raw?.clientMessageId ? String(raw.clientMessageId) : undefined,
    };
}

function keyOf(m: ChatMessageData & { clientMessageId?: string }) {
    if (m.clientMessageId) return `c:${m.clientMessageId}`;
    if (m.id && !m.id.startsWith('temp-')) return `id:${m.id}`;
    return `h:${m.chatId}|${m.fromUserId}|${m.toUserId}|${hash(m.content)}|${m.createdAt}`;
}

export function useChatConversation(params: { myUserId: string; contactId: string; token: string }) {
    const { myUserId, contactId, token } = params;

    const [messages, setMessages] = useState<(ChatMessageData & { clientMessageId?: string })[]>([]);
    const [chatId, setChatId] = useState('');
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [socketState, setSocketState] = useState<SocketState>('connecting');

    const chatIdRef = useRef('');
    const seenRef = useRef(new Set<string>());
    const pendingIncomingRef = useRef<(ChatMessageData & { clientMessageId?: string })[]>([]);
    const everOpenRef = useRef(false);

    const findOptimisticIdx = (
        arr: (ChatMessageData & { clientMessageId?: string })[],
        incoming: (ChatMessageData & { clientMessageId?: string }),
    ) => {
        const incTs = new Date(incoming.createdAt).getTime();

        return arr.findIndex(x => {
            const isTemp = String(x.id).startsWith('temp-') || x.delivered === false;
            if (!isTemp) return false;

            if (x.fromUserId !== incoming.fromUserId) return false;
            if (x.toUserId !== incoming.toUserId) return false;
            if (x.content !== incoming.content) return false;

            if (incoming.chatId && x.chatId && incoming.chatId !== x.chatId) return false;

            const xTs = new Date(x.createdAt).getTime();
            return Math.abs(xTs - incTs) < 10_000; 
        });
    };

    function updateSeenRefs(m: ChatMessageData & { clientMessageId?: string }, k: string) {
        seenRef.current.add(k);
        if (m.id && !String(m.id).startsWith('temp-')) seenRef.current.add(`id:${m.id}`);
        if (m.clientMessageId) seenRef.current.add(`c:${m.clientMessageId}`);
    }

    function handleById(next: (ChatMessageData & { clientMessageId?: string })[], m: ChatMessageData & { clientMessageId?: string }, k: string) {
        if (m.id && !String(m.id).startsWith('temp-')) {
            const idxById = next.findIndex(x => x.id === m.id);
            if (idxById >= 0) {
                next[idxById] = { ...next[idxById], ...m, delivered: true };
                updateSeenRefs(m, k);
                return true;
            }
        }
        return false;
    }

    function handleByClientMessageId(next: (ChatMessageData & { clientMessageId?: string })[], m: ChatMessageData & { clientMessageId?: string }, k: string) {
        if (m.clientMessageId) {
            const idx = next.findIndex(x =>
                (x as any).clientMessageId === m.clientMessageId || x.id === `temp-${m.clientMessageId}`
            );
            if (idx >= 0) {
                next[idx] = { ...m, delivered: true };
                updateSeenRefs(m, k);
                if (m.id && !String(m.id).startsWith('temp-')) seenRef.current.add(`id:${m.id}`);
                return true;
            }
        }
        return false;
    }

    function handleOptimistic(next: (ChatMessageData & { clientMessageId?: string })[], m: ChatMessageData & { clientMessageId?: string }, k: string) {
        if (!m.clientMessageId && m.fromUserId === myUserId) {
            const idxOpt = findOptimisticIdx(next, m);
            if (idxOpt >= 0) {
                const existing = next[idxOpt];
                const carryClientId =
                    existing.clientMessageId ||
                    (String(existing.id).startsWith('temp-') ? String(existing.id).slice(5) : undefined);

                next[idxOpt] = {
                    ...m,
                    delivered: true,
                    clientMessageId: carryClientId,
                };

                updateSeenRefs(m, k);
                if (carryClientId) seenRef.current.add(`c:${carryClientId}`);
                if (m.id && !String(m.id).startsWith('temp-')) seenRef.current.add(`id:${m.id}`);
                return true;
            }
        }
        return false;
    }

    function handleDedup(next: (ChatMessageData & { clientMessageId?: string })[], m: ChatMessageData & { clientMessageId?: string }, k: string) {
        if (seenRef.current.has(k)) return false;
        updateSeenRefs(m, k);
        next.push(m);
        return true;
    }

    const addMessages = useCallback((arr: (ChatMessageData & { clientMessageId?: string })[]) => {
        setMessages(prev => {
            const next = [...prev];
            let changed = false;

            for (const m of arr) {
                const k = keyOf(m);

                if (handleById(next, m, k)) { changed = true; continue; }
                if (handleByClientMessageId(next, m, k)) { changed = true; continue; }
                if (handleOptimistic(next, m, k)) { changed = true; continue; }
                if (handleDedup(next, m, k)) { changed = true; }
            }

            if (!changed) return prev;

            next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return next;
        });
    }, [myUserId]);

    useEffect(() => {
        let alive = true;
        setMessages([]);
        setChatId('');
        chatIdRef.current = '';
        seenRef.current.clear();
        pendingIncomingRef.current = [];
        setHistoryLoaded(false);

        (async () => {
            let cid = '';
            try { cid = await getChatIdWith(contactId, token); }
            catch { cid = await localStableChatId(myUserId, contactId); }

            if (!alive) return;
            setChatId(cid);
            chatIdRef.current = cid;

            const hist = await getChatHistory(cid, token).catch(() => []);
            if (!alive) return;

            const mapped = (hist as any[]).map(h => mapRaw(h, cid));
            addMessages(mapped);

            if (pendingIncomingRef.current.length) {
                addMessages(pendingIncomingRef.current.splice(0));
            }

            setHistoryLoaded(true);
        })();

        return () => { alive = false; };
    }, [contactId, myUserId, token, addMessages]);

    useEffect(() => {
        const socket = getSharedChatSocket(token);

        const offState = socket.onState((s) => {
            setSocketState(s);
            if (s === 'open') everOpenRef.current = true;
        });

        const offMsg = socket.subscribe((incoming) => {
            const m = mapRaw(incoming, chatIdRef.current || 'unknown');

            const participantsMatch =
                (m.fromUserId === myUserId && m.toUserId === contactId) ||
                (m.fromUserId === contactId && m.toUserId === myUserId);

            if (!participantsMatch) return;

            if (!chatIdRef.current) {
                pendingIncomingRef.current.push(m);
                return;
            }

            if (m.chatId && m.chatId !== chatIdRef.current) return;

            addMessages([m]);
        });

        return () => {
            offMsg();
            offState();
        };
    }, [token, myUserId, contactId, addMessages]);

    const canSend = useMemo(() => {
        const hasBasics = historyLoaded && !!chatId;
        if (!hasBasics) return false;
        return socketState === 'open' || everOpenRef.current;
    }, [historyLoaded, chatId, socketState]);

    const send = useCallback((text: string) => {
        const t = text.trim();
        if (!t || !chatIdRef.current) return;

        const clientMessageId = rnd();

        const optimistic: ChatMessageData & { clientMessageId?: string } = {
            id: `temp-${clientMessageId}`,
            chatId: chatIdRef.current,
            fromUserId: myUserId,
            toUserId: contactId,
            content: t,
            createdAt: new Date().toISOString(),
            delivered: false,
            read: false,
            clientMessageId,
        };

        addMessages([optimistic]);

        const socket = getSharedChatSocket(token);
        socket.sendMessage(contactId, t, chatIdRef.current, clientMessageId);
    }, [myUserId, contactId, token, addMessages]);

    return { messages, chatId, historyLoaded, socketState, canSend, send };
}
