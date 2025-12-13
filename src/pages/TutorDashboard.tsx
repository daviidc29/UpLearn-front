import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';

import TutorLayout from '../layouts/TutorLayout';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';

import ApiPaymentService from '../service/Api-payment';
import { getTutorReservations, type Reservation } from '../service/Api-scheduler';
import { getMyTasks, type Task, type TaskStatus } from '../service/Api-tasks';
import { ENV } from '../utils/env';

type Tab =
  | 'dashboard'
  | 'my-students'
  | 'sessions'
  | 'availability'
  | 'requests'
  | 'available-tasks';

const COP_PER_TOKEN = 1700;

// -------------------- Tipos auxiliares --------------------
type PublicProfile = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

type StudentSummary = {
  studentId: string;
  profile: PublicProfile;
  sessionsCompleted: number;
  lastSessionDate?: string;
};

function toSimpleDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(hhmm?: string): string {
  const s = (hhmm ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}

function isUpcomingReservation(r: Reservation, now = new Date()): boolean {
  const start = new Date(`${r.date}T${formatTime(r.start)}`);
  return start.getTime() > now.getTime();
}

function isFinalLike(status: Reservation['status'] | TaskStatus | null | undefined): boolean {
  const s = (status ?? '').toString().toUpperCase();
  return s === 'FINALIZADA' || s === 'CANCELADA' || s === 'VENCIDA' || s === 'RECHAZADA';
}

function parseISODateOnly(s?: string | null): string {
  if (!s) return '';
  return s.includes('T') ? s.split('T')[0] : s;
}

function isUpcomingDate(dateISO?: string | null, now = new Date()): boolean {
  if (!dateISO) return true;
  const d = new Date(`${parseISODateOnly(dateISO)}T23:59:59`);
  return d.getTime() >= now.getTime();
}

// ---- helpers de perfiles públicos ----
async function fetchProfilesForIds(ids: string[], token: string): Promise<Record<string, PublicProfile>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const reqs = unique.map(id =>
    fetch(`${ENV.USERS_BASE}${ENV.USERS_PROFILE_PATH}?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  );
  const results = await Promise.allSettled(reqs);
  const map: Record<string, PublicProfile> = {};
  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value) {
      map[unique[i]] = res.value as PublicProfile;
    }
  });
  return map;
}

const TutorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const { userRoles, isAuthenticated } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [showProfileNotification, setShowProfileNotification] = useState(true);

  // Tabs desde query ?tab=
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tabFromQuery = (search.get('tab') as Tab) || 'dashboard';
  const [active, setActive] = useState<Tab>(tabFromQuery);
  useEffect(() => setActive(tabFromQuery), [tabFromQuery]);

  // Estado de datos
  const [loadingData, setLoadingData] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);

  // LISTAS PREVIEW (máx 3)
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([]);
  const [acceptedTasks, setAcceptedTasks] = useState<Task[]>([]);
  const [studentsTop, setStudentsTop] = useState<StudentSummary[]>([]);

  // CONTADORES REALES (no depende del preview)
  const [studentsCount, setStudentsCount] = useState(0);
  const [upcomingReservationsCount, setUpcomingReservationsCount] = useState(0);
  const [acceptedTasksCount, setAcceptedTasksCount] = useState(0);

  // Seguridad de ruta
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (userRoles && !userRoles.includes('tutor')) { navigate('/'); return; }
  }, [isAuthenticated, userRoles, navigate]);

  // Carga principal del dashboard
  useEffect(() => {
    if (active !== 'dashboard' || !auth.user) return;
    const token = (auth.user as any)?.id_token ?? auth.user?.access_token;
    if (!token) return;

    // Para contar estudiantes y tener historial, usamos un rango amplio desde 2020
    const now = new Date();
    const future = new Date(); future.setDate(now.getDate() + 30);
    const fromStr = '2020-01-01';
    const toStr = toSimpleDate(future);
    const currentTutorId = auth.user?.profile?.sub;

    const load = async () => {
      setLoadingData(true);
      try {
        const [walletRes, reservationsRes, myTasksRes] = await Promise.allSettled([
          ApiPaymentService.getTutorBalance(token),
          getTutorReservations(fromStr, toStr, token),
          getMyTasks(token),
        ]);

        // Wallet
        if (walletRes.status === 'fulfilled') {
          setTokenBalance(walletRes.value?.tokenBalance ?? 0);
        } else {
          setTokenBalance(0);
        }

        // Reservas
        if (reservationsRes.status === 'fulfilled') {
          const reservations: Reservation[] = reservationsRes.value ?? [];
          setAllReservations(reservations);

          const upcomingAll = reservations
            .filter(r => !isFinalLike(r.status) && isUpcomingReservation(r, now))
            .sort((a, b) =>
              new Date(`${a.date}T${formatTime(a.start)}`).getTime()
              - new Date(`${b.date}T${formatTime(b.start)}`).getTime()
            );

          // ✅ contador real + preview max 3
          setUpcomingReservationsCount(upcomingAll.length);
          setUpcomingReservations(upcomingAll.slice(0, 3));

          // ---- Mis estudiantes (resumen) ----
          const byStudent: Record<string, Reservation[]> = {};
          for (const r of reservations) {
            if (!r.studentId) continue;
            if (!byStudent[r.studentId]) byStudent[r.studentId] = [];
            byStudent[r.studentId].push(r);
          }
          const studentIds = Object.keys(byStudent);
          setStudentsCount(studentIds.length);

          if (studentIds.length > 0) {
            const profiles = await fetchProfilesForIds(studentIds, token);
            const summaries: StudentSummary[] = studentIds.map(id => {
              const list = byStudent[id].slice().sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              return {
                studentId: id,
                profile: profiles[id] || { name: 'Estudiante' },
                sessionsCompleted: list.filter(x => (x.status ?? '').toUpperCase() === 'FINALIZADA').length,
                lastSessionDate: list[0]?.date,
              };
            });

            // Top 3 por actividad reciente (última sesión) y luego por #completadas
            summaries.sort((a, b) => {
              const ad = a.lastSessionDate ? new Date(a.lastSessionDate).getTime() : 0;
              const bd = b.lastSessionDate ? new Date(b.lastSessionDate).getTime() : 0;
              if (ad !== bd) return bd - ad;
              return (b.sessionsCompleted || 0) - (a.sessionsCompleted || 0);
            });

            setStudentsTop(summaries.slice(0, 3));
          } else {
            setStudentsTop([]);
          }
        } else {
          setAllReservations([]);
          setUpcomingReservations([]);
          setUpcomingReservationsCount(0);
          setStudentsTop([]);
          setStudentsCount(0);
        }

        // Tareas aceptadas/en progreso
        if (myTasksRes.status === 'fulfilled') {
          const mineAll = (myTasksRes.value ?? [])
            .filter(t =>
              t.tutorId === currentTutorId &&
              !isFinalLike(t.estado) &&
              isUpcomingDate(t.fechaLimite, now)
            )
            .sort((a, b) => {
              const ad = parseISODateOnly(a.fechaLimite);
              const bd = parseISODateOnly(b.fechaLimite);
              return (ad || '').localeCompare(bd || '');
            });

          // ✅ contador real + preview max 3
          setAcceptedTasksCount(mineAll.length);
          setAcceptedTasks(mineAll.slice(0, 3));
        } else {
          setAcceptedTasks([]);
          setAcceptedTasksCount(0);
        }
      } catch (err) {
        console.error('Error en dashboard:', err);
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, [active, auth.user]);

  if (auth.isLoading) return <div className="full-center">Cargando...</div>;

  const estimatedCop = useMemo(
    () => (tokenBalance * COP_PER_TOKEN).toLocaleString('es-CO'),
    [tokenBalance]
  );

  const renderDashboard = () => (
    <div className="dashboard-content fade-in">
      <h1>¡Bienvenido, {auth.user?.profile?.name || 'Tutor'}! 👨‍🏫</h1>

      {/* KPIs (CUENTAN TOTAL REAL, NO EL PREVIEW) */}
      <div className="stats-grid">
        <button
          type="button"
          className="stat-card clickable"
          onClick={() => navigate('/tutor/students')}
          aria-label="Ir a Mis Estudiantes"
        >
          <div className="stat-icon icon-blue">👥</div>
          <div className="stat-info">
            <h3>{loadingData ? '...' : studentsCount}</h3>
            <p>Mis estudiantes</p>
          </div>
        </button>

        <button
          type="button"
          className="stat-card clickable"
          onClick={() => navigate('/tutor-classes')}
          aria-label="Ir a Sesiones/Clases"
        >
          <div className="stat-icon icon-blue">📅</div>
          <div className="stat-info">
            <h3>{loadingData ? '...' : upcomingReservationsCount}</h3>
            <p>Reservas próximas</p>
          </div>
        </button>

        <button
          type="button"
          className="stat-card clickable"
          onClick={() => navigate('/tutor-classes')}
          aria-label="Ir a Tareas Activas"
        >
          <div className="stat-icon icon-green">✅</div>
          <div className="stat-info">
            <h3>{loadingData ? '...' : acceptedTasksCount}</h3>
            <p>Tareas activas</p>
          </div>
        </button>

        <div className="stat-card">
          <div className="stat-icon icon-yellow">💰</div>
          <div className="stat-info">
            <h3>
              {loadingData ? '...' : tokenBalance}{' '}
              <small style={{ fontSize: '0.6em', color: '#666' }}>tokens</small>
            </h3>
            <p>≈ ${estimatedCop} COP</p>
          </div>
        </div>
      </div>

      {/* 3 columnas: Estudiantes | Próximas reservas | Tareas aceptadas */}
      <section className="triple-grid">
        {/* Mis estudiantes (preview máx 3) */}
        <div className="section-card">
          <header className="section-header">
            <h3>
              Mis estudiantes{' '}
              <span className="muted">
                ({loadingData ? '...' : `${Math.min(3, studentsCount)} de ${studentsCount}`})
              </span>
            </h3>
            <button className="btn-link" type="button" onClick={() => navigate('/tutor/students')}>
              Ver todos →
            </button>
          </header>
          <div className="section-list">
            {studentsTop.length === 0 && <div className="card muted">Aún no tienes estudiantes.</div>}
            {studentsTop.map(s => (
              <article key={s.studentId} className="mini-row clickable" onClick={() => navigate('/tutor/students')}>
                <div className="mini-row__title">
                  <strong>{s.profile.name || 'Estudiante'}</strong>
                </div>
                <div className="mini-row__meta">
                  <span>✅ {s.sessionsCompleted} completadas</span>
                  {s.lastSessionDate && <span>📅 {parseISODateOnly(s.lastSessionDate)}</span>}
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Próximas reservas (preview máx 3) */}
        <div className="section-card">
          <header className="section-header">
            <h3>
              Próximas reservas{' '}
              <span className="muted">
                ({loadingData ? '...' : `${Math.min(3, upcomingReservationsCount)} de ${upcomingReservationsCount}`})
              </span>
            </h3>
            <button className="btn-link" type="button" onClick={() => navigate('/tutor-classes')}>
              Ir a solicitudes →
            </button>
          </header>
          <div className="section-list">
            {upcomingReservations.length === 0 && <div className="card muted">No tienes reservas próximas.</div>}
            {upcomingReservations.map(res => (
              <article key={res.id} className="mini-row clickable" onClick={() => navigate('/tutor/tasks/available')}>
                <div className="mini-row__title">
                  <strong>{(res as any).studentName || 'Estudiante'}</strong>
                </div>
                <div className="mini-row__meta">
                  <span>📅 {res.date}</span>
                  <span>⏰ {formatTime(res.start)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Tareas aceptadas/en progreso (preview máx 3) */}
        <div className="section-card">
          <header className="section-header">
            <h3>
              Tareas aceptadas{' '}
              <span className="muted">
                ({loadingData ? '...' : `${Math.min(3, acceptedTasksCount)} de ${acceptedTasksCount}`})
              </span>
            </h3>
            <button className="btn-link" type="button" onClick={() => navigate('/tutor-classes')}>
              Ver todas →
            </button>
          </header>
          <div className="section-list">
            {acceptedTasks.length === 0 && <div className="card muted">Aún no tienes tareas aceptadas.</div>}
            {acceptedTasks.map(task => (
              <article key={task.id} className="mini-row clickable" onClick={() => navigate('/tutor/tasks/available')}>
                <div className="mini-row__title">
                  <strong>{task.titulo}</strong>
                </div>
                <div className="mini-row__meta">
                  <span>📚 {task.materia}</span>
                  {task.fechaLimite && <span>⏳ {parseISODateOnly(task.fechaLimite)}</span>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <TutorLayout active={active}>
      {!isProfileComplete && showProfileNotification && missingFields && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="tutor"
          onDismiss={() => setShowProfileNotification(false)}
        />
      )}

      {active === 'dashboard' && renderDashboard()}
    </TutorLayout>
  );
};

export default TutorDashboard;
