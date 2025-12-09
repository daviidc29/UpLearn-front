import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import "../styles/Chat.css";
import "../styles/StudentReservations.css";

import { useAuthFlow } from "../utils/useAuthFlow";
import { useProfileStatus } from "../utils/useProfileStatus";
import { ENV } from "../utils/env";

import {
  getMyReservations,
  cancelReservation,
  type Reservation as ApiReservation,
} from "../service/Api-scheduler";

import { ChatWindow } from "../components/chat/ChatWindow";
import { ChatContact } from "../service/Api-chat";
import { createCallSession } from "../service/Api-call";

import { AppHeader, type ActiveSection } from "./StudentDashboard";
import ApiPaymentService from "../service/Api-payment";
import { studentMenuNavigate, type StudentMenuSection } from "../utils/StudentMenu";

// ==== Fecha/hora helpers ====
function toISODateLocal(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function todayLocalISO(): string { return toISODateLocal(new Date()); }
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00"); const day = d.getDay(); const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff); return toISODateLocal(d);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days); return toISODateLocal(d);
}
function formatTime(timeStr: string): string {
  const s = (timeStr ?? "").trim(); const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s.slice(0, 5);
}
function isPresentReservation(r: ApiReservation, now: Date = new Date()): boolean {
  const end = new Date(`${r.date}T${formatTime(r.end)}`); return end.getTime() >= now.getTime();
}

// ==== Reglas de estado ====
function getEffectiveStatus(res: ApiReservation): ApiReservation["status"] {
  const now = new Date();
  const startTime = new Date(`${res.date}T${formatTime(res.start)}`);
  const endTime = new Date(`${res.date}T${formatTime(res.end)}`);
  const raw = (res.status || "").toUpperCase();

  if (raw === "PENDIENTE") return now > endTime ? "VENCIDA" : "PENDIENTE";
  if (raw === "ACEPTADO") {
    if (now >= startTime && now <= endTime) return "ACTIVA";
    if (now > endTime) {
      const rAny = res as any;
      const student = Boolean(rAny.studentAttended ?? rAny.attendedStudent ?? rAny.attendedByStudent ?? rAny.attended);
      const tutor = Boolean(rAny.tutorAttended ?? rAny.attendedTutor ?? rAny.attendedByTutor ?? rAny.attended);
      const hadCall = Boolean(rAny.hadCall || rAny.callStartedAt || rAny.callEndedAt || (rAny.callDurationSec > 0));
      if (hadCall || (student && tutor)) return "FINALIZADA";
      return "INCUMPLIDA";
    }
    return "ACEPTADO";
  }
  return raw as ApiReservation["status"];
}

// ==== Tipos ====
interface User { userId: string; name: string; email: string; role: string; }
interface Reservation extends ApiReservation { effectiveStatus: ApiReservation["status"]; tutorName?: string; }

// ==== Página ====
const StudentReservationsPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();

  const [token, setToken] = useState<string | undefined>();
  useEffect(() => {
    if (auth.isAuthenticated && auth.user) setToken((auth.user as any)?.id_token ?? auth.user?.access_token);
    else setToken(undefined);
  }, [auth.isAuthenticated, auth.user]);

  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow();
  useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  useEffect(() => {
    if (isAuthenticated === null || userRoles === null) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (needsRoleSelection) { navigate("/role-selection"); return; }
    if (!userRoles?.includes("student")) { navigate("/"); return; }
    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || "unknown",
        name: auth.user.profile?.name || auth.user.profile?.nickname || "Usuario",
        email: auth.user.profile?.email || "No email",
        role: "student",
      });
    }
  }, [isAuthenticated, userRoles, needsRoleSelection, navigate, auth.user]);

  const [activeChatContact, setActiveChatContact] = useState<ChatContact | null>(null);
  const myUserId = auth.user?.profile.sub;

  const [weekStart, setWeekStart] = useState(() => mondayOf(todayLocalISO()));
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const [showAll, setShowAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  // Balance de tokens
  useEffect(() => {
    const t = (auth.user as any)?.id_token ?? auth.user?.access_token;
    if (!t) return;
    (async () => {
      try {
        const data = await ApiPaymentService.getStudentBalance(t);
        setTokenBalance(data.tokenBalance);
      } catch { /* noop */ }
    })();
  }, [auth.user]);

  const RESERVATIONS_PER_PAGE = 15;
  const USERS_BASE = ENV.USERS_BASE;
  const PROFILE_PATH = ENV.USERS_PROFILE_PATH;

  const [profilesByTutorId, setProfilesByTutorId] = useState<Record<string, any>>({});

  const loadMyReservations = async () => {
    if (!token) return;
    const from = addDays(weekStart, -35);
    const to = addDays(weekStart, 35);
    try {
      setReservationsLoading(true);
      const data = await getMyReservations(from, to, token);
      const withStatus: Reservation[] = data.map(r => ({ ...r, effectiveStatus: getEffectiveStatus(r) }));
      setMyReservations(withStatus);
    } catch {
      setMyReservations([]);
    } finally {
      setReservationsLoading(false);
    }
  };

  useEffect(() => { if (token) loadMyReservations(); }, [token]);
  useEffect(() => { if (token) loadMyReservations(); }, [weekStart]);

  const fetchTutorProfile = async (idOrSub: string, token: string) => {
    const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
    const tryQuery = async (key: "id" | "sub") => {
      const url = `${USERS_BASE}${PROFILE_PATH}?${key}=${encodeURIComponent(idOrSub)}`;
      const resp = await fetch(url, { headers });
      return resp.ok ? resp.json() : null;
    };
    const prof = (await tryQuery("id")) ?? (await tryQuery("sub"));
    return { id: idOrSub, prof };
  };

  useEffect(() => {
    const ids = Array.from(new Set(myReservations.map(r => r?.tutorId).filter(Boolean)))
      .filter(id => !profilesByTutorId[id]);
    if (ids.length === 0 || !token) return;

    let cancelled = false;
    (async () => {
      try {
        const settled = await Promise.allSettled(ids.map(idOrSub => fetchTutorProfile(idOrSub, token)));
        if (cancelled) return;
        const next: Record<string, any> = {};
        for (const r of settled) {
          if (r.status === "fulfilled" && r.value.prof) {
            const { id, prof } = r.value;
            next[id] = {
              id: prof?.id, sub: prof?.sub,
              name: prof?.name || prof?.fullName || "Tutor",
              email: prof?.email, avatarUrl: prof?.avatarUrl, tokensPerHour: prof?.tokensPerHour,
            };
          }
        }
        if (Object.keys(next).length > 0) setProfilesByTutorId(prev => ({ ...prev, ...next }));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [myReservations, profilesByTutorId, USERS_BASE, PROFILE_PATH, token]);

  const upcomingCount = useMemo(
    () => myReservations.filter(r => r.effectiveStatus !== "CANCELADO" && isPresentReservation(r)).length,
    [myReservations]
  );

  // Semana filtrada
  const weekReservations = myReservations.filter(r => {
    const resDate = new Date(r.date + "T00:00:00");
    const s = new Date(weekStart + "T00:00:00");
    const e = new Date(addDays(weekStart, 6) + "T23:59:59");
    return resDate >= s && resDate <= e;
  });

  // visibles
  const base = showAll ? weekReservations : weekReservations.filter(r => isPresentReservation(r));
  const visibleReservations = showAll ? base : base.filter(r => r.effectiveStatus !== "CANCELADO");

  const totalPages = Math.max(1, Math.ceil(visibleReservations.length / RESERVATIONS_PER_PAGE));
  const paginated = visibleReservations.slice((currentPage - 1) * RESERVATIONS_PER_PAGE, currentPage * RESERVATIONS_PER_PAGE);
  useEffect(() => { setCurrentPage(1); }, [showAll, weekStart]);

  const cancelTutorReservation = async (res: Reservation) => {
    if (!token) return;
    const eff = (res.effectiveStatus || '').toUpperCase();
    const startMs = new Date(`${res.date}T${formatTime(res.start)}`).getTime();
    const hoursUntilStart = (startMs - Date.now()) / (1000 * 60 * 60);
    const allowed = (eff === 'PENDIENTE' || eff === 'ACEPTADO') && hoursUntilStart >= 12;
    if (!allowed) { alert('Solo puedes cancelar reservas PENDIENTE o ACEPTADO y con 12+ horas de antelación.'); return; }
    if (globalThis.confirm('¿Seguro que quieres cancelar esta reserva?')) {
      await cancelReservation(res.id, token);
      if (eff === 'ACEPTADO') {
        const mySub = myUserId || currentUser?.userId || '';
        try {
          await ApiPaymentService.refundOnCancellation({
            fromUserId: mySub, toUserId: res.tutorId, reservationId: res.id,
            cancelledBy: 'STUDENT', reason: 'Cancelación por estudiante'
          }, token);
        } catch { /* noop */ }
        try {
          const balanceData = await ApiPaymentService.getStudentBalance(token);
          setTokenBalance(balanceData.tokenBalance);
          globalThis.dispatchEvent(new CustomEvent('tokens:refresh'));
        } catch { /* noop */ }
      }
      await loadMyReservations();
    }
  };

  const joinNow = async (res: Reservation) => {
    try {
      if (!token) { alert("No hay sesión activa."); return; }
      let sessionId: string | undefined = (res as any).callSessionId ?? (res as any).sessionId ?? undefined;
      if (!sessionId) {
        const created = await createCallSession(res.id, token);
        sessionId = created.sessionId;
      }
      sessionStorage.setItem("call:reservation:" + sessionId, String(res.id));
      navigate(`/call/${sessionId}?reservationId=${encodeURIComponent(String(res.id))}`);
    } catch (e: any) {
      alert("No se pudo iniciar la reunión: " + (e?.message ?? "error"));
    }
  };

  if (auth.isLoading) return <div className="full-center">⏳ Verificando acceso...</div>;
  if (!currentUser) return <div className="full-center">🔍 Cargando información...</div>;

  const statusBadge = (status?: string | null) => {
    const s = (status || "").toUpperCase();
    const styles: { [key: string]: { label: string; color: string; bg: string } } = {
      CANCELADO: { label: "CANCELADO", color: "#ef4444", bg: "rgba(239,68,68,.12)" },
      PENDIENTE: { label: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
      ACEPTADO: { label: "ACEPTADA", color: "#10b981", bg: "rgba(16,185,129,.12)" },
      ACTIVA: { label: "ACTIVA", color: "#3b82f6", bg: "rgba(59,130,246,.12)" },
      INCUMPLIDA: { label: "INCUMPLIDA", color: "#f97316", bg: "rgba(249,115,22,.12)" },
      FINALIZADA: { label: "FINALIZADA", color: "#0ea5e9", bg: "rgba(14,165,233,.12)" },
      VENCIDA: { label: "VENCIDA", color: "#6b7280", bg: "rgba(107,114,128,.15)" },
    };
    return styles[s] || { label: s, color: "#6b7280", bg: "rgba(107,114,128,.12)" };
  };

  const onHeaderSectionChange = (section: ActiveSection) => {
    if (section === "none") return;
    studentMenuNavigate(navigate, section as StudentMenuSection);
  };

  return (
    <div className="dashboard-container">
      <AppHeader
        currentUser={currentUser}
        activeSection={"my-reservations"}
        onSectionChange={onHeaderSectionChange}
        tokenBalance={tokenBalance}
      />

      <main className="dashboard-main dashboard-main--tight">
        <div className="tasks-section">
          <h1>Mis Reservas 🗓️</h1>

          <div className="stats-grid" style={{ marginTop: 8, marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-icon">🗓️</div><div className="stat-info"><h3>{upcomingCount}</h3><p>Reservas presentes</p></div></div>
            <div className="stat-card"><div className="stat-icon">🧑‍🏫</div><div className="stat-info"><h3>{
              new Set(myReservations.map(r => r.tutorId).filter(Boolean)).size
            }</h3><p>Tutores con solicitudes/reservas</p></div></div>
          </div>

          <div className="page-with-chat-container">
            <div className={`main-content ${activeChatContact ? "chat-open" : ""}`}>
              <div className="card card--primary-soft reservations-panel">
                <div className="week-toolbar">
                  <button className="btn btn-ghost btn-nav" onClick={() => setWeekStart(addDays(weekStart, -7))} type="button">« Anterior</button>
                  <div className="week-toolbar__title">Semana del {weekStart} al {addDays(weekStart, 6)}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-nav" onClick={() => setShowAll(!showAll)} type="button" style={{ backgroundColor: "white", color: "#5b46d8" }}>
                      {showAll ? "Mostrar presentes" : "Mostrar todas"}
                    </button>
                    <button className="btn btn-ghost btn-nav" onClick={() => setWeekStart(addDays(weekStart, 7))} type="button">Siguiente »</button>
                  </div>
                </div>

                {reservationsLoading && <div className="empty-note">Cargando reservas…</div>}
                {!reservationsLoading && (() => {
                  const visible = visibleReservations.length === 0;
                  return visible ? <div className="empty-note">{showAll ? "No tienes reservas esta semana." : "No tienes reservas activas esta semana."}</div> : null;
                })()}

                <div className="reservations-list">
                  {paginated.map((r) => {
                    const b = statusBadge(r.effectiveStatus);
                    const prof = profilesByTutorId[r.tutorId];
                    const tutorName = prof?.name || r.tutorName || "Tutor";
                    const startMs = new Date(`${r.date}T${formatTime(r.start)}`).getTime();
                    const hoursUntilStart = (startMs - Date.now()) / (1000 * 60 * 60);
                    const canCancel = (r.effectiveStatus === 'PENDIENTE' || r.effectiveStatus === 'ACEPTADO') && hoursUntilStart >= 12;

                    const canJoin = r.effectiveStatus === "ACTIVA";
                    const canContact = r.effectiveStatus === "ACEPTADO" || r.effectiveStatus === "INCUMPLIDA";

                    return (
                      <article key={r.id} className="reservation-card">
                        <header className="reservation-card__header">
                          <h3 className="reservation-card__title">Reserva con {tutorName}</h3>
                          <span className="status-pill" style={{ color: b.color, background: b.bg }}>{b.label}</span>
                        </header>

                        <div className="reservation-card__meta" style={{ marginTop: 6 }}>
                          <span>📅 {r.date}</span>
                          <span>🕒 {formatTime(r.start)} – {formatTime(r.end)}</span>
                        </div>

                        <div className="reservation-card__actions">
                          <button type="button" className="btn btn-primary" onClick={() => joinNow(r)}
                            disabled={!canJoin} title={canJoin ? "Entrar a la reunión" : "Disponible solo cuando la reserva está ACTIVA"}
                            style={{ marginRight: 8 }}>
                            ▶ Reunirse ahora
                          </button>

                          <button type="button" className="btn btn-success" onClick={() => setActiveChatContact({
                            id: r.tutorId, sub: r.tutorId,
                            name: profilesByTutorId[r.tutorId]?.name || "Tutor",
                            email: profilesByTutorId[r.tutorId]?.email || "N/A",
                            avatarUrl: profilesByTutorId[r.tutorId]?.avatarUrl
                          })}
                            disabled={!canContact} title={canContact ? "Contactar al tutor" : "Solo disponible con reservas ACEPTADAS o INCUMPLIDAS"}>
                            Contactar
                          </button>

                          <button type="button" className="btn btn-danger" onClick={() => cancelTutorReservation(r)}
                            disabled={!canCancel} title={canCancel ? "Cancelar esta reserva" : "Solo si falta 12+ horas y estado PENDIENTE/ACEPTADO"}>
                            Cancelar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {visibleReservations.length > 15 && (
                  <div className="pagination-controls" style={{ marginTop: "20px", textAlign: "center" }}>
                    <button className="btn btn-ghost" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} type="button">Anterior</button>
                    <span style={{ margin: "0 15px", color: "white", fontWeight: "bold" }}>Página {currentPage} de {totalPages}</span>
                    <button className="btn btn-ghost" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} type="button">Siguiente</button>
                  </div>
                )}
              </div>
            </div>

            {activeChatContact && myUserId && token && (
              <aside className="chat-side-panel">
                <button className="close-chat-btn" onClick={() => setActiveChatContact(null)} type="button">×</button>
                <ChatWindow contact={activeChatContact} myUserId={myUserId} token={token} />
              </aside>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentReservationsPage;
