import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import { getTutorReservations, type Reservation } from '../service/Api-scheduler';
import { createCallSession } from '../service/Api-call';

import '../styles/TutorDashboard.css';
import '../styles/Chat.css';
import { ENV } from '../utils/env';

import {
    ChatContact,
    ChatMessageData,
    getChatHistory,
    getChatIdWith,
    localStableChatId,
} from '../service/Api-chat';
import { ChatSocket } from '../service/ChatSocket';

function toISODateLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
function formatDate(anyDate: string | Date): string {
    let d: Date;
    if (typeof anyDate === 'string') {
        const appendTime = anyDate.length === 10 ? 'T00:00:00' : '';
        d = new Date(anyDate + appendTime);
    } else { d = anyDate; }
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function onlyHHmm(timeStr: string): string {
    const s = (timeStr ?? '').trim();
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}
function getEffectiveStatus(res: Reservation): string {
    const now = new Date();
    const startMs = new Date(`${res.date}T${onlyHHmm(res.start)}`).getTime();
    const endMs = new Date(`${res.date}T${onlyHHmm(res.end)}`).getTime();
    const nowMs = now.getTime();
    const raw = (res.status || '').toUpperCase();

    if (raw === 'CANCELADO') return 'CANCELADO';
    if (raw === 'FINALIZADA') return 'FINALIZADA';
    if (raw === 'INCUMPLIDA') return 'INCUMPLIDA';

    if (raw === 'PENDIENTE') return nowMs > endMs ? 'VENCIDA' : 'PENDIENTE';
    if (raw === 'ACEPTADO') {
        if (nowMs >= startMs && nowMs <= endMs) return 'ACTIVA';
        if (nowMs > endMs) return (res as any).attended === false ? 'INCUMPLIDA' : 'FINALIZADA';
        return 'ACEPTADO';
    }
    return raw || 'DESCONOCIDO';
}

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
function cryptoRandomId(): string {
    try { return crypto.getRandomValues(new Uint32Array(4)).join('-'); }
    catch { return `${Date.now()}-${Math.random()}`; }
}
function resolveTimestamp(m: unknown): string {
    if (m && typeof m === 'object') {
        const mm = m as { createdAt?: string; timestamp?: string };
        return mm.createdAt ?? mm.timestamp ?? new Date().toISOString();
    }
    return new Date().toISOString();
}

const ChatMessageBubble: React.FC<{ message: ChatMessageData; isMine: boolean }> = ({ message, isMine }) => {
    const bubbleClass = isMine ? 'chat-bubble mine' : 'chat-bubble theirs';
    const ts = resolveTimestamp(message);
    return (
        <div className={bubbleClass}>
            <p>{message.content}</p>
            <span className="timestamp">
                {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    );
};

interface ChatSidePanelProps {
    contact: ChatContact;
    myUserId: string;
    token: string;
    onClose: () => void;
}
const ChatSidePanel: React.FC<ChatSidePanelProps> = ({ contact, myUserId, token, onClose }) => {
    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [realChatId, setRealChatId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<ChatSocket | null>(null);

    const lastStateRef = useRef<'connecting' | 'open' | 'closed' | 'error' | null>(null);
    const lastChangeTsRef = useRef<number>(0);
    const closedOnceRef = useRef(false);

    const onWsState = (state: 'connecting' | 'open' | 'closed' | 'error') => {
        const now = Date.now();
        if (state === 'connecting' && lastStateRef.current === 'connecting') return;
        const noisyClosed = state === 'closed' && lastStateRef.current === 'connecting' && (now - lastChangeTsRef.current) < 500;
        if (noisyClosed) return;

        lastStateRef.current = state;
        lastChangeTsRef.current = now;
        if ((state === 'closed' || state === 'error') && !closedOnceRef.current) {
            closedOnceRef.current = true;
            onClose();
        }
    };

    useEffect(() => {
        socketRef.current = new ChatSocket();
        socketRef.current.connect(
            token,
            (incoming: any) => {
                const raw = (incoming && typeof incoming.data === 'string') ? JSON.parse(incoming.data) : incoming;
                const msg = mapAnyToServerShape(raw, realChatId || 'unknown');
                if (!realChatId || msg.chatId === realChatId) setMessages(prev => [...prev, msg]);
            },
            onWsState
        );
        return () => socketRef.current?.disconnect();
    }, [token]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            let cid = '';
            try { cid = await getChatIdWith(contact.id, token); }
            catch { cid = await localStableChatId(myUserId, contact.id); }
            if (!mounted) return;
            setRealChatId(cid);

            try {
                const hist = await getChatHistory(cid, token);
                if (!mounted) return;
                setMessages(hist.map(h => mapAnyToServerShape(h, cid || 'unknown')));
            } catch { if (mounted) setMessages([]); }
        })();
        return () => { mounted = false; };
    }, [contact.id, myUserId, token]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        socketRef.current?.sendMessage(contact.id, newMessage);
        setNewMessage('');
    };

    return (
        <div className="chat-side-panel">
            <div className="chat-window-header">
                <h4>{contact.name}</h4>
                <button onClick={onClose} className="close-chat-btn">×</button>
            </div>
            <div className="chat-messages">
                {messages.map(msg => (
                    <ChatMessageBubble key={msg.id} message={msg} isMine={msg.fromUserId === myUserId} />
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form className="chat-input-form" onSubmit={handleSend}>
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Escribe un mensaje..." />
                <button type="submit">Enviar</button>
            </form>
        </div>
    );
};

const USERS_BASE = ENV.USERS_BASE;
const PROFILE_PATH = ENV.USERS_PROFILE_PATH;

async function fetchPublicProfileByIdOrSub(base: string, path: string, idOrSub: string, token?: string) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const tryQuery = async (key: 'id' | 'sub') => {
        const url = `${base}${path}?${key}=${encodeURIComponent(idOrSub)}`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) return { ok: false, status: resp.status };
        return { ok: true, raw: await resp.json() };
    };
    let r = await tryQuery('id');
    if (!r.ok) r = await tryQuery('sub');
    if (!r.ok) throw Object.assign(new Error('PROFILE_FETCH_FAILED'), { status: r.status });
    return r.raw;
}

type StudentGroup = {
    studentId: string;
    studentName: string;
    studentAvatar?: string;
    reservations: (Reservation & { effectiveStatus: string })[];
};

const TutorMeetingsNowPage: React.FC = () => {
    const auth = useAuth();
    const navigate = useNavigate();

    const token = (auth.user as any)?.id_token ?? auth.user?.access_token;
    const myUserId = auth.user?.profile.sub;

    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [query, setQuery] = useState('');
    const [showPast, setShowPast] = useState(false);
    const [profilesById, setProfilesById] = useState<Record<string, ChatContact>>({});
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<5 | 10 | 20>(10);
    const [activeChatContact, setActiveChatContact] = useState<ChatContact | null>(null);

    const requestedProfilesRef = useRef<Set<string>>(new Set());
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 30);
            const toDate = new Date(); toDate.setDate(toDate.getDate() + 60);
            const from = toISODateLocal(fromDate);
            const to = toISODateLocal(toDate);

            const data = await getTutorReservations(from, to, token);
            setReservations(data.filter(r => r.status !== 'CANCELADO'));
        } catch (e: any) {
            setMessage('❌ ' + (e.message || 'Error cargando clases'));
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const handleContact = (studentId: string, studentName: string, studentAvatar?: string) => {
        setActiveChatContact({
            id: studentId,
            sub: studentId,
            name: studentName,
            email: profilesById[studentId]?.email || 'N/A',
            avatarUrl: studentAvatar,
        });
    };

    const handleJoinNow = async (res: Reservation & { effectiveStatus?: string }) => {
        try {
            if (!token) {
                setMessage('❌ Error: No hay sesión activa (falta token).');
                return;
            }

            const { sessionId } = await createCallSession(res.id, token);

            sessionStorage.setItem('call:reservation:' + sessionId, String(res.id));
            navigate(`/call/${sessionId}`);
        } catch (e: any) {
            setMessage('❌ No se pudo iniciar la reunión: ' + (e?.message ?? 'error'));
        }
    };

    const getStatusColor = (status?: string | null) => ({
        'PENDIENTE': '#F59E0B',
        'ACEPTADO': '#10B981',
        'ACTIVA': '#6366F1',
        'FINALIZADA': '#0EA5E9',
        'INCUMPLIDA': '#F97316',
        'VENCIDA': '#9CA3AF',
    }[String(status || '').toUpperCase()] || '#6B7280');

    const getStatusText = (status?: string | null) => (status || '').toUpperCase() || '—';

    const reservationsFiltered = useMemo(() => {
        return reservations
            .map(r => ({ ...r, effectiveStatus: getEffectiveStatus(r) }))
            .filter(r => {
                if (filterStatus !== 'all' && r.effectiveStatus !== filterStatus) return false;
                if (!showPast) {
                    const endTime = new Date(`${r.date}T${onlyHHmm(r.end)}`).getTime();
                    return endTime >= Date.now();
                }
                return true;
            })
            .sort((a, b) => new Date(`${a.date}T${a.start}`).getTime() - new Date(`${b.date}T${b.start}`).getTime());
    }, [reservations, filterStatus, showPast]);

    useEffect(() => {
        if (!token) return;
        const rawIds = Array.from(new Set(reservations.map(r => r.studentId).filter(Boolean)));
        const ids = rawIds.filter(id => !profilesById[id] && !requestedProfilesRef.current.has(id));
        if (ids.length === 0) return;
        for (const id of ids) requestedProfilesRef.current.add(id);

        (async () => {
            const nextProfiles: Record<string, ChatContact> = {};
            const settled = await Promise.allSettled(
                ids.map(async (idOrSub) => {
                    const prof = await fetchPublicProfileByIdOrSub(USERS_BASE, PROFILE_PATH, idOrSub, token);
                    return { id: idOrSub, prof };
                })
            );
            for (const r of settled) {
                if (r.status === 'fulfilled') {
                    const id = r.value.id;
                    const p = r.value.prof;
                    nextProfiles[id] = {
                        id,
                        sub: p?.sub ?? id,
                        name: p?.name || p?.fullName || 'Estudiante',
                        email: p?.email || 'N/A',
                        avatarUrl: p?.avatarUrl,
                    };
                } else {
                    const id = (r as any).reason?.id || 'unknown';
                    nextProfiles[id] = { id, sub: id, name: 'Estudiante', email: 'N/A' };
                }
            }
            if (Object.keys(nextProfiles).length > 0) {
                setProfilesById(prev => ({ ...prev, ...nextProfiles }));
            }
        })();
    }, [reservations, profilesById, token]);

    const groupsAll: StudentGroup[] = useMemo(() => {
        const acc: Record<string, StudentGroup> = {};
        for (const res of reservationsFiltered) {
            const sid = res.studentId;
            const profile = profilesById[sid];
            const name = (res as any).studentName || profile?.name || 'Estudiante';
            const avatar = (res as any).studentAvatar || profile?.avatarUrl;
            if (!acc[sid]) acc[sid] = { studentId: sid, studentName: name, studentAvatar: avatar, reservations: [] };
            acc[sid].reservations.push(res as any);
        }
        return Object.values(acc).sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'));
    }, [reservationsFiltered, profilesById]);

    const groupsFiltered = useMemo(() => {
        if (!query.trim()) return groupsAll;
        const q = norm(query);
        return groupsAll.filter(g => norm(g.studentName).includes(q));
    }, [groupsAll, query]);

    const totalPages = Math.max(1, Math.ceil(groupsFiltered.length / pageSize));
    const pageSafe = Math.min(page, totalPages);
    const groupsPage = groupsFiltered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
    useEffect(() => { setPage(1); }, [filterStatus, query, pageSize, showPast]);

    return (
        <div className="page-with-chat-container">
            <div className={`main-content ${activeChatContact ? 'chat-open' : ''}`}>
                <h1 style={{ marginBottom: 8 }}>Mis Clases 🎓</h1>
                <p style={{ marginTop: -8, opacity: .7 }}>(Contenido de clases programadas y completadas)</p>
                {message && <output className="status-message" aria-live="polite">{message}</output>}

                <div className="filters-card">
                    <div className="filters-row">
                        <div className="search-input">
                            <input
                                placeholder="Buscar estudiante…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            <span className="search-icon">🔎</span>
                        </div>

                        <select className="status-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="all">Todos</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="ACEPTADO">Aceptado</option>
                            <option value="ACTIVA">Activa</option>
                            <option value="FINALIZADA">Finalizada</option>
                            <option value="INCUMPLIDA">Incumplida</option>
                            <option value="VENCIDA">Vencida</option>
                        </select>

                        <label className="past-toggle">
                            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                            <span>Mostrar pasadas</span>
                        </label>
                    </div>
                </div>

                {loading && <p>Cargando…</p>}
                {!loading && groupsPage.length === 0 && <p>No hay clases para mostrar.</p>}

                {groupsPage.map(group => (
                    <div key={group.studentId} className="student-group-card">
                        <div className="student-group-header">
                            {group.studentAvatar
                                ? <img src={group.studentAvatar} alt={group.studentName} />
                                : <div className="avatar-neutral" aria-hidden="true" />
                            }
                            <h3>{group.studentName}</h3>
                        </div>

                        <div className="reservations-container">
                            {group.reservations.map((res: any) => {
                                const effectiveStatus = res.effectiveStatus;

                                const allow = ['ACTIVA'].includes(effectiveStatus);
                                const allowChat = ['ACEPTADO', 'INCUMPLIDA', 'ACTIVA'].includes(effectiveStatus);
                                const canContact = allowChat;
                                const canJoin = allow;

                                return (
                                    <div key={res.id} className="reservation-row">
                                        <div className="reservation-info">
                                            <p className="reservation-datetime">
                                                📅 {formatDate(res.date)} • 🕐 {onlyHHmm(res.start)} - {onlyHHmm(res.end)}
                                            </p>
                                            <p className="reservation-id">ID: {String(res.id).slice(0, 8)}...</p>
                                        </div>
                                        <div className="reservation-meta">
                                            <span
                                                className="status-badge"
                                                style={{ backgroundColor: `${getStatusColor(effectiveStatus)}20`, color: getStatusColor(effectiveStatus) }}
                                            >
                                                {getStatusText(effectiveStatus)}
                                            </span>
                                        </div>
                                        <div className="reservation-actions">
                                            <button
                                                className="btn-action btn-join"
                                                onClick={() => handleJoinNow(res)}
                                                disabled={!canJoin}
                                                title={canJoin ? 'Iniciar/Reanudar tutoría' : 'Disponible para ACEPTADO, INCUMPLIDA y ACTIVA'}
                                            >
                                                ▶ Reunirse ahora
                                            </button>
                                            <button
                                                className="btn-action btn-contact"
                                                onClick={() => handleContact(group.studentId, group.studentName, group.studentAvatar)}
                                                disabled={!canContact}
                                                title={canContact ? 'Contactar' : 'Disponible para ACEPTADO, INCUMPLIDA y ACTIVA'}
                                            >
                                                ● Contactar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {totalPages > 1 && (
                    <div className="pagination">
                        <button disabled={pageSafe === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>←</button>
                        <span>{pageSafe}/{totalPages}</span>
                        <button disabled={pageSafe === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>→</button>
                        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) as 5 | 10 | 20)}>
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                        </select>
                    </div>
                )}
            </div>

            {activeChatContact && myUserId && token && (
                <ChatSidePanel
                    contact={activeChatContact}
                    myUserId={myUserId}
                    token={token}
                    onClose={() => setActiveChatContact(null)}
                />
            )}
        </div>
    );
};

export default TutorMeetingsNowPage;
