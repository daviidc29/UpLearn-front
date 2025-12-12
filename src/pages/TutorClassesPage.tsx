import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  acceptReservation,
  cancelReservation,
  getTutorReservations,
  type Reservation,
} from '../service/Api-scheduler';
import ApiPaymentService from '../service/Api-payment';
import ApiUserService from '../service/Api-user';

// IMPORTANTE: Usamos el nuevo componente optimizado
import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatContact } from '../service/Api-chat';

import '../styles/TutorDashboard.css';
import '../styles/Chat.css';
import { ENV } from '../utils/env';

// ==== Helpers de Fecha y Estado ====

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

function formatTime(timeStr: string): string {
  const s = (timeStr ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}

function getEffectiveStatus(res: Reservation): string {
  const now = new Date();
  const startMs = new Date(`${res.date}T${formatTime(res.start)}`).getTime();
  const endMs = new Date(`${res.date}T${formatTime(res.end)}`).getTime();
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

const getStatusColor = (status?: string | null) => ({
  'PENDIENTE': '#F59E0B',
  'ACEPTADO': '#10B981',
  'ACTIVA': '#6366F1',
  'FINALIZADA': '#0EA5E9',
  'INCUMPLIDA': '#F97316',
  'VENCIDA': '#9CA3AF',
}[String(status || '').toUpperCase()] || '#6B7280');

const getStatusText = (status?: string | null) => (status || '').toUpperCase() || '—';

// ==== Helpers de Perfil ====

const USERS_BASE = ENV.USERS_BASE;
const PROFILE_PATH = ENV.USERS_PROFILE_PATH;

async function fetchPublicProfileByIdOrSub(base: string, path: string, idOrSub: string, token?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  
  // Intentar por ID
  const urlId = `${base}${path}?id=${encodeURIComponent(idOrSub)}`;
  const respId = await fetch(urlId, { headers });
  if (respId.ok) return await respId.json();
  
  // Intentar por Sub
  const urlSub = `${base}${path}?sub=${encodeURIComponent(idOrSub)}`;
  const respSub = await fetch(urlSub, { headers });
  if (respSub.ok) return await respSub.json();
  
  return null;
}

type StudentGroup = {
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  reservations: (Reservation & { effectiveStatus: string })[];
};

// ==== Componente Principal ====

const TutorClassesPage: React.FC = () => {
  const auth = useAuth();
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
  const [pageSize, setPageSize] = useState<5 | 10 | 20>(5);
  const [activeChatContact, setActiveChatContact] = useState<ChatContact | null>(null);

  const requestedProfilesRef = useRef<Set<string>>(new Set());
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // 1. Cargar Reservas
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 30);
      const toDate = new Date(); toDate.setDate(toDate.getDate() + 60);
      const data = await getTutorReservations(toISODateLocal(fromDate), toISODateLocal(toDate), token);
      setReservations(data.filter(r => r.status !== 'CANCELADO'));
    } catch (e: any) {
      setMessage('❌ ' + (e.message || 'Error cargando clases'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // 2. Handlers de Acción (Aceptar, Cancelar, Contactar)

  const handleAccept = async (reservationId: string, studentId: string) => {
    if (!token || !myUserId) return;
    try {
      // 1. Aceptar en Scheduler
      await acceptReservation(reservationId, studentId, token);
      
      // 2. Obtener tarifa (por defecto 1 token)
      let tokensPerClass = 1;
      try {
        const rateResp: any = await ApiUserService.getTutorTokensRate(token);
        const maybe = Number(rateResp?.tokensPerHour);
        if (!Number.isNaN(maybe) && maybe > 0) tokensPerClass = maybe;
      } catch (e) {
        console.warn('Usando tarifa por defecto (1 token).', e);
      }

      // 3. Transferir tokens
      try {
        await ApiPaymentService.transferTokens(
          studentId,      // from (estudiante)
          myUserId,       // to (tutor)
          tokensPerClass, 
          reservationId, 
          token
        );
        setMessage('✅ Clase aceptada y tokens transferidos');
      } catch (e: any) {
        console.warn('Fallo transferencia, continuando como prueba gratis:', e);
        setMessage('✅ Clase aceptada (Sin cobro de tokens).');
      }

      // 4. Refrescar UI
      try {
        globalThis.dispatchEvent(new CustomEvent('tokens:refresh'));
      } catch {}
      await load();

    } catch (e: any) { 
      setMessage('❌ ' + (e.message || 'Error al aceptar')); 
    }
  };

  const handleCancel = async (reservationId: string, studentId: string) => {
    if (!token || !myUserId) return;
    try {
      // 1. Cancelar en Scheduler
      await cancelReservation(reservationId, token);
      
      // 2. Notificar Refund
      await ApiPaymentService.refundOnCancellation({
        fromUserId: studentId,
        toUserId: myUserId,
        reservationId,
        cancelledBy: 'TUTOR',
        reason: 'Cancelación realizada por tutor'
      }, token);

      setMessage('✅ Clase cancelada');
      
      // 3. Refrescar UI
      try {
        globalThis.dispatchEvent(new CustomEvent('tokens:refresh'));
      } catch {}
      await load();

    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('409') || /Conflict/i.test(msg)) {
        alert('No se puede cancelar: solo PENDIENTE o ACEPTADO y con 12+ horas de antelación.');
      } else {
        setMessage('❌ ' + (e.message || 'Error al cancelar'));
      }
    }
  };

  const handleContact = (studentId: string, studentName: string, studentAvatar?: string) => {
    setActiveChatContact({
      id: studentId,
      sub: studentId,
      name: studentName,
      email: profilesById[studentId]?.email || 'N/A',
      avatarUrl: studentAvatar,
    });
  };

  // 3. Cargar Perfiles de Estudiantes
  useEffect(() => {
    if (!token) return;
    const rawIds = Array.from(new Set(reservations.map(r => r.studentId).filter(Boolean)));
    const ids = rawIds.filter(id => !profilesById[id] && !requestedProfilesRef.current.has(id));
    if (ids.length === 0) return;

    for (const id of ids) {
      requestedProfilesRef.current.add(id);
    }

    (async () => {
      const newProfs: Record<string, ChatContact> = {};
      await Promise.all(ids.map(async (id) => {
        try {
            const p = await fetchPublicProfileByIdOrSub(USERS_BASE, PROFILE_PATH, id, token);
            if (p) {
                newProfs[id] = {
                    id: id,
                    sub: p.sub ?? id,
                    name: p.name || p.fullName || 'Estudiante',
                    email: p.email || 'N/A',
                    avatarUrl: p.avatarUrl
                };
            } else {
                // Fallback si falla
                newProfs[id] = { id, sub: id, name: 'Estudiante', email: 'N/A' };
            }
        } catch {
            newProfs[id] = { id, sub: id, name: 'Estudiante', email: 'N/A' };
        }
      }));
      setProfilesById(prev => ({ ...prev, ...newProfs }));
    })();
  }, [reservations, token, profilesById]);

  // 4. Agrupación y Filtrado
  const groupsAll: StudentGroup[] = useMemo(() => {
    const acc: Record<string, StudentGroup> = {};
    for (const res of reservations) {
        const eff = getEffectiveStatus(res);
        
        // Filtro de pasadas
        if (!showPast) {
            const endTime = new Date(`${res.date}T${formatTime(res.end)}`).getTime();
            if (endTime < Date.now()) continue;
        }

        // Filtro de estado
        if (filterStatus !== 'all' && eff !== filterStatus) continue;

        const sid = res.studentId;
        if (!acc[sid]) {
            const p = profilesById[sid];
            acc[sid] = { 
                studentId: sid, 
                studentName: (res as any).studentName || p?.name || 'Estudiante', 
                studentAvatar: (res as any).studentAvatar || p?.avatarUrl, 
                reservations: [] 
            };
        }
        acc[sid].reservations.push({ ...res, effectiveStatus: eff });
    }
    // Ordenar por nombre
    return Object.values(acc).sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'));
  }, [reservations, profilesById, showPast, filterStatus]);

  const groupsFiltered = useMemo(() => {
    if (!query.trim()) return groupsAll;
    const q = norm(query);
    return groupsAll.filter(g => norm(g.studentName).includes(q));
  }, [groupsAll, query]);

  // 5. Paginación
  const totalPages = Math.max(1, Math.ceil(groupsFiltered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const groupsPage = groupsFiltered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  
  useEffect(() => { setPage(1); }, [filterStatus, query, pageSize, showPast]);

  return (
    <div className="page-with-chat-container">
      <div className={`main-content ${activeChatContact ? 'chat-open' : ''}`}>
        <h1 style={{ marginBottom: 8 }}>Solicitudes</h1>
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
        {!loading && groupsPage.length === 0 && <p>No hay solicitudes que coincidan.</p>}

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
              {group.reservations.map((res) => {
                const effectiveStatus = res.effectiveStatus;
                
                const startMs = new Date(`${res.date}T${formatTime(res.start)}`).getTime();
                const hoursUntilStart = (startMs - Date.now()) / (1000 * 60 * 60);

                const canAccept = effectiveStatus === 'PENDIENTE';
                const canCancel = (effectiveStatus === 'PENDIENTE' || effectiveStatus === 'ACEPTADO') && hoursUntilStart >= 12;
                const canContact = effectiveStatus === 'ACEPTADO' || effectiveStatus === 'INCUMPLIDA';

                return (
                  <div key={res.id} className="reservation-row">
                    <div className="reservation-info">
                      <p className="reservation-datetime">
                        📅 {formatDate(res.date)} • 🕐 {formatTime(res.start)} - {formatTime(res.end)}
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
                        className="btn-action btn-accept" 
                        onClick={() => handleAccept(res.id, group.studentId)} 
                        disabled={!canAccept}
                      >
                        ✓ Aceptar
                      </button>
                      
                      <button
                        className="btn-action btn-cancel"
                        onClick={() => handleCancel(res.id, group.studentId)}
                        disabled={!canCancel}
                        title={canCancel ? 'Cancelar esta reserva' : 'No se puede cancelar en este estado'}
                      >
                        ✗ Cancelar
                      </button>
                      
                      <button
                        className="btn-action btn-contact"
                        onClick={() => handleContact(group.studentId, group.studentName, group.studentAvatar)}
                        disabled={!canContact}
                        title={canContact ? 'Contactar al estudiante' : 'Solo puedes contactar para clases aceptadas'}
                      >
                        💬 Contactar
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
        <aside className="chat-side-panel">
            {/* Aquí usamos el nuevo ChatWindow optimizado */}
            <ChatWindow
              contact={activeChatContact}
              myUserId={myUserId}
              token={token}
              onClose={() => setActiveChatContact(null)}
            />
        </aside>
      )}
    </div>
  );
};

export default TutorClassesPage;