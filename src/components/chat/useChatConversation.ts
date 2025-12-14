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
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) || 0)) | 0;
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
  // fallback fuerte (ms completos, no recortar a segundos)
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

  const addMessages = useCallback((arr: (ChatMessageData & { clientMessageId?: string })[]) => {
    setMessages(prev => {
      const next = [...prev];
      let changed = false;

      for (const m of arr) {
        const k = keyOf(m);
        if (seenRef.current.has(k)) continue;

        // reemplazo optimistic por clientMessageId (si backend lo devuelve)
        if (m.clientMessageId) {
          const idx = next.findIndex(x => (x as any).clientMessageId === m.clientMessageId || x.id === `temp-${m.clientMessageId}`);
          if (idx >= 0) {
            next[idx] = { ...m, delivered: true };
            seenRef.current.add(k);
            changed = true;
            continue;
          }
        }

        seenRef.current.add(k);
        next.push(m);
        changed = true;
      }

      if (!changed) return prev;

      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });
  }, []);

  // 1) Inicializa chatId + history (rápido)
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

      // aplica lo que llegó por WS mientras cargaba
      if (pendingIncomingRef.current.length) {
        addMessages(pendingIncomingRef.current.splice(0));
      }

      setHistoryLoaded(true);
    })();

    return () => { alive = false; };
  }, [contactId, myUserId, token, addMessages]);

  // 2) Suscripción a 1 solo WS (compartido)
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

      // Si todavía no hay chatId, guarda y mezcla después
      if (!chatIdRef.current) {
        pendingIncomingRef.current.push(m);
        return;
      }

      // Si tu backend sí manda chatId, filtra (pero no te quedes sin mensajes si viene vacío)
      if (m.chatId && m.chatId !== chatIdRef.current) return;

      addMessages([m]);
    });

    return () => {
      offMsg();
      offState();
    };
  }, [token, myUserId, contactId, addMessages]);

  // Permite enviar sin bloquearte después de haber conectado 1 vez (si se cae, encola)
  const canSend = useMemo(() => {
    const hasBasics = historyLoaded && !!chatId;
    if (!hasBasics) return false;
    return socketState === 'open' || everOpenRef.current; // <- clave para no “esperar 5s”
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
