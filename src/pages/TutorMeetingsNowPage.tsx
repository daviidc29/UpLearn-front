import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import { getTutorReservations, type Reservation } from '../service/Api-scheduler';
import { createCallSession } from '../service/Api-call';

import '../styles/TutorDashboard.css';
import '../styles/Chat.css';
import { ENV } from '../utils/env';

import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatContact } from '../service/Api-chat';
import { ChatSocket } from '../service/ChatSocket';

// ==== Utils fecha/hora ====
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

// ==== Profiles ====
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

    // chat (usando ChatWindow)
    const [activeChatContact, setActiveChatContact] = useState<ChatContact | null>(null);

    const [unreadByUserId, setUnreadByUserId] = useState<Record<string, number>>({});
    const notifSocketRef = useRef<ChatSocket | null>(null);

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

    useEffect(() => {
        if (!token || !myUserId) return;

        if (notifSocketRef.current) {
            notifSocketRef.current.disconnect();
            notifSocketRef.current = null;
        }

        const s = new ChatSocket({ autoReconnect: true, pingIntervalMs: 20000 });
        notifSocketRef.current = s;

        s.connect(token, (incoming: any) => {
            const from = String(incoming?.fromUserId ?? incoming?.senderId ?? incoming?.from ?? incoming?.userId ?? '');
            const to = String(incoming?.toUserId ?? incoming?.recipientId ?? incoming?.to ?? '');
            const content = String(incoming?.content ?? incoming?.text ?? '');

            if (!from || !to || !content) return; // ignora pings u otros
            const other = from === myUserId ? to : from;

            if (!activeChatContact || activeChatContact.id !== other) {
                setUnreadByUserId(prev => ({ ...prev, [other]: (prev[other] || 0) + 1 }));
            }
        });

        return () => {
            s.disconnect();
            notifSocketRef.current = null;
        };
    }, [token, myUserId, activeChatContact?.id]);

    const handleContact = (studentId: string, studentName: string, studentAvatar?: string) => {
        setActiveChatContact({
            id: studentId,
            sub: studentId,
            name: studentName,
            email: profilesById[studentId]?.email || 'N/A',
            avatarUrl: studentAvatar,
        });
        setUnreadByUserId(prev => ({ ...prev, [studentId]: 0 }));
    };


    const handleJoinNow = async (
        res: Reservation & { effectiveStatus?: string },
        student: StudentGroup,
    ) => {
        try {
            if (!token) {
                setMessage("❌ Error: No hay sesión activa (falta token).");
                return;
            }
            let sessionId: string | undefined =
                (res as any).callSessionId ?? (res as any).sessionId ?? undefined;

            if (!sessionId) {
                const created = await createCallSession(res.id, token);
                sessionId = created.sessionId;
            }

            sessionStorage.setItem("call:reservation:" + sessionId, String(res.id));

            const studentProfile = profilesById[student.studentId];

            navigate(
                `/call/${sessionId}?reservationId=${encodeURIComponent(String(res.id))}`,
                {
                    state: {
                        peerId: student.studentId,
                        peerName: student.studentName,
                        peerEmail: studentProfile?.email || 'N/A',
                        peerAvatar: student.studentAvatar,
                        role: 'tutor',
                    },
                },
            );
        } catch (e: any) {
            setMessage("❌ No se pudo iniciar la reunión: " + (e?.message ?? "error"));
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
                            <input placeholder="Buscar estudiante…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                            {group.studentAvatar ? <img src={group.studentAvatar} alt={group.studentName} /> : <div className="avatar-neutral" aria-hidden="true" />}
                            <h3>{group.studentName}</h3>
                        </div>

                        <div className="reservations-container">
                            {group.reservations.map((res: any) => {
                                const effectiveStatus = getEffectiveStatus(res);

                                const canJoin = effectiveStatus === 'ACTIVA';
                                const canContact = effectiveStatus === 'ACEPTADO' || effectiveStatus === 'INCUMPLIDA';

                                return (
                                    <div key={res.id} className="reservation-row">
                                        <div className="reservation-info">
                                            <p className="reservation-datetime">📅 {formatDate(res.date)} • 🕐 {onlyHHmm(res.start)} - {onlyHHmm(res.end)}</p>
                                            <p className="reservation-id">ID: {String(res.id).slice(0, 8)}...</p>
                                        </div>
                                        <div className="reservation-meta">
                                            <span className="status-badge" style={{ backgroundColor: `${getStatusColor(effectiveStatus)}20`, color: getStatusColor(effectiveStatus) }}>
                                                {getStatusText(effectiveStatus)}
                                            </span>
                                        </div>
                                        <div className="reservation-actions">
                                            <button
                                                className="btn-action btn-join"
                                                onClick={() => handleJoinNow(res, group)}
                                                disabled={!canJoin}
                                                title={canJoin ? 'Iniciar/Reanudar tutoría' : 'Disponible solo cuando la reserva está ACTIVA'}
                                            >
                                            ▶ Reunirse ahora
                                        </button>
                                        <button className="btn-action btn-contact"
                                            onClick={() => handleContact(group.studentId, group.studentName, group.studentAvatar)}
                                            disabled={!canContact}
                                            title={canContact ? 'Contactar' : 'Disponible para ACEPTADO o INCUMPLIDA'}>
                                            ● Contactar
                                            {unreadByUserId[group.studentId] > 0 && <span className="badge-dot" aria-label="mensajes sin leer" />}
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
                        <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
                    </select>
                </div>
            )}
        </div>

            {
        activeChatContact && myUserId && token && (
            <aside className="chat-side-panel">
                <button className="close-chat-btn" onClick={() => setActiveChatContact(null)} type="button" aria-label="Cerrar chat">×</button>
                <ChatWindow contact={activeChatContact} myUserId={myUserId} token={token} />
            </aside>
        )
    }
        </div >
    );
};

export default TutorMeetingsNowPage;
