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
import { getAvailableTasks, getMyTasks, type Task, type TaskStatus } from '../service/Api-tasks';

type Tab =
  | 'dashboard'
  | 'my-students'
  | 'sessions'
  | 'availability'
  | 'requests'
  | 'available-tasks';

const COP_PER_TOKEN = 1700;

// -------------------- Utilidades de fecha/hora --------------------
function toSimpleDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function formatTime(hhmm: string): string {
  const s = (hhmm ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}
function isUpcomingReservation(r: Reservation, now = new Date()): boolean {
  const start = new Date(`${r.date}T${formatTime(r.start)}`);
  return start.getTime() > now.getTime();
}
function isFinalLike(status: Reservation['status'] | TaskStatus | null | undefined): boolean {
  return status === 'FINALIZADA' || status === 'CANCELADA' || status === 'VENCIDA' || status === 'RECHAZADA';
}
function parseISODateOnly(s?: string | null): string {
  if (!s) return '';
  // admite 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm'
  return s.includes('T') ? s.split('T')[0] : s;
}
function isUpcomingDate(dateISO?: string | null, now = new Date()): boolean {
  if (!dateISO) return true; // si no hay fecha límite, la consideramos vigente
  const d = new Date(`${parseISODateOnly(dateISO)}T23:59:59`);
  return d.getTime() >= now.getTime();
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

  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [acceptedTasks, setAcceptedTasks] = useState<Task[]>([]);

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

    const now = new Date();
    const past = new Date(); past.setDate(now.getDate() - 30);
    const future = new Date(); future.setDate(now.getDate() + 30);

    const fromStr = toSimpleDate(past);
    const toStr = toSimpleDate(future);

    const currentTutorId = auth.user?.profile?.sub;

    const load = async () => {
      setLoadingData(true);
      try {
        const [walletRes, reservationsRes, availTasksRes, myTasksRes] = await Promise.allSettled([
          ApiPaymentService.getTutorBalance(token),
          getTutorReservations(fromStr, toStr, token),
          getAvailableTasks(token),
          getMyTasks(token),
        ]);

        // Wallet
        if (walletRes.status === 'fulfilled') {
          setTokenBalance(walletRes.value?.tokenBalance ?? 0);
        } else {
          console.warn('No se pudo cargar wallet tutor:', walletRes.reason);
          setTokenBalance(0);
        }

        // Reservas (próximas; quitar finalizadas/canceladas/vencidas)
        if (reservationsRes.status === 'fulfilled') {
          const all: Reservation[] = reservationsRes.value ?? [];
          const upcoming = all
            .filter(r =>
              !isFinalLike(r.status) &&
              isUpcomingReservation(r, now)
            )
            .sort((a, b) =>
              new Date(`${a.date}T${formatTime(a.start)}`).getTime()
              - new Date(`${b.date}T${formatTime(b.start)}`).getTime()
            );
          setUpcomingReservations(upcoming);
        } else {
          console.error('Error cargando reservas:', reservationsRes.reason);
          setUpcomingReservations([]);
        }

        // Tareas disponibles (solicitudes)
        if (availTasksRes.status === 'fulfilled') {
          const reqs = (availTasksRes.value ?? []).filter(t => t.estado === 'PUBLICADA');
          setAvailableTasks(reqs);
        } else {
          console.warn('No se pudieron cargar tareas disponibles:', availTasksRes.reason);
          setAvailableTasks([]);
        }

        // Tareas aceptadas/en progreso para el TUTOR actual
        if (myTasksRes.status === 'fulfilled') {
          const mine = (myTasksRes.value ?? [])
            .filter(t =>
              // asignadas a mí y no final/rech/cancel
              t.tutorId === currentTutorId
              && !isFinalLike(t.estado)
              && isUpcomingDate(t.fechaLimite, now)
            )
            .sort((a, b) => {
              const ad = parseISODateOnly(a.fechaLimite);
              const bd = parseISODateOnly(b.fechaLimite);
              return (ad || '').localeCompare(bd || '');
            });
          setAcceptedTasks(mine);
        } else {
          console.warn('No se pudieron cargar mis tareas:', myTasksRes.reason);
          setAcceptedTasks([]);
        }
      } catch (err) {
        console.error('Error crítico en dashboard:', err);
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, [active, auth.user]);

  if (auth.isLoading) return <div className="full-center">Cargando...</div>;

  // --------- UI helpers ----------
  const estimatedCop = useMemo(
    () => (tokenBalance * COP_PER_TOKEN).toLocaleString('es-CO'),
    [tokenBalance]
  );

  const activeTasksCount = useMemo(
    () => acceptedTasks.length, // “Tareas activas” = aceptadas o en progreso, no final/ni cancel
    [acceptedTasks]
  );

  // --------- Render principal ---------
  const renderDashboard = () => (
    <div className="dashboard-content fade-in">
      <h1>¡Bienvenido, {auth.user?.profile?.name || 'Tutor'}! 👨‍🏫</h1>

      {/* KPIs */}
      <div className="stats-grid">
        <button
          type="button"
          className="stat-card clickable"
          onClick={() => navigate('/tutor/tasks/available')}
          aria-label="Ir a Tareas Disponibles"
        >
          <div className="stat-icon icon-purple">📝</div>
          <div className="stat-info">
            <h3>{loadingData ? '...' : availableTasks.length}</h3>
            <p>Solicitudes de tareas</p>
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
            <h3>{loadingData ? '...' : upcomingReservations.length}</h3>
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
            <h3>{loadingData ? '...' : activeTasksCount}</h3>
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

      {/* Actividad y recordatorios */}
      <div className="recent-activity">
        <h2>Actividad y recordatorios</h2>
        <div className="activity-list">
          {loadingData && <p className="text-muted">Cargando actividad...</p>}

          {!loadingData && upcomingReservations.length === 0 && acceptedTasks.length === 0 && availableTasks.length === 0 && (
            <div className="empty-state">
              <p>No tienes actividad pendiente por ahora.</p>
            </div>
          )}

          {/* Próximas reservas */}
          {upcomingReservations.slice(0, 2).map(res => (
            <div
              key={res.id}
              className="activity-item clickable"
              onClick={() => navigate('/tutor-classes')}
            >
              <div className="activity-icon-wrapper bg-blue-light">
                <span className="activity-icon">🎓</span>
              </div>
              <div className="activity-content">
                <p>
                  <strong>Clase próxima:</strong> {res.studentName || 'Estudiante'}
                </p>
                <small>
                  {res.date} • {formatTime(res.start)} — {res.status}
                </small>
              </div>
              <div className="activity-action">
                <button className="btn-small" type="button">Ver</button>
              </div>
            </div>
          ))}

          {/* Nuevas solicitudes */}
          {availableTasks.slice(0, 2).map(task => (
            <div
              key={task.id}
              className="activity-item clickable"
              onClick={() => navigate('/tutor/tasks/available')}
            >
              <div className="activity-icon-wrapper bg-purple-light">
                <span className="activity-icon">📋</span>
              </div>
              <div className="activity-content">
                <p><strong>Solicitud:</strong> {task.titulo}</p>
                <small>
                  {task.materia} {task.fechaLimite ? `• Límite: ${parseISODateOnly(task.fechaLimite)}` : ''}
                </small>
              </div>
              <div className="activity-action">
                <button className="btn-small btn-outline" type="button">Aplicar</button>
              </div>
            </div>
          ))}

          {/* Tareas aceptadas/próximas */}
          {acceptedTasks.slice(0, 3).map(task => (
            <div
              key={task.id}
              className="activity-item clickable"
              onClick={() => navigate('/tutor-classes')}
            >
              <div className="activity-icon-wrapper bg-green-light">
                <span className="activity-icon">✅</span>
              </div>
              <div className="activity-content">
                <p><strong>Tarea en curso:</strong> {task.titulo}</p>
                <small>
                  {task.materia} {task.fechaLimite ? `• Entrega: ${parseISODateOnly(task.fechaLimite)}` : ''}
                </small>
              </div>
              <div className="activity-action">
                <button className="btn-small" type="button">Abrir</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bandeja de tareas: Solicitudes (izq) vs Aceptadas (der) */}
      <section className="tasks-dual-pane">
        <div className="tasks-pane">
          <header className="tasks-pane__header">
            <h3>Solicitudes de estudiantes</h3>
            <button
              className="btn-link"
              type="button"
              onClick={() => navigate('/tutor/tasks/available')}
            >
              Ver todas →
            </button>
          </header>
          <div className="tasks-list">
            {availableTasks.length === 0 && <div className="card muted">No hay solicitudes por ahora.</div>}
            {availableTasks.slice(0, 6).map(task => (
              <article key={task.id} className="task-row clickable" onClick={() => navigate('/tutor/tasks/available')}>
                <div className="task-row__title">
                  <span className="pill pill--purple">PUBLICADA</span>
                  <strong>{task.titulo}</strong>
                </div>
                <div className="task-row__meta">
                  <span>📚 {task.materia}</span>
                  {task.fechaLimite && <span>⏳ {parseISODateOnly(task.fechaLimite)}</span>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="tasks-pane">
          <header className="tasks-pane__header">
            <h3>Tareas aceptadas</h3>
            <button
              className="btn-link"
              type="button"
              onClick={() => navigate('/tutor-classes')}
            >
              Ir a agenda →
            </button>
          </header>
          <div className="tasks-list">
            {acceptedTasks.length === 0 && <div className="card muted">Aún no tienes tareas aceptadas.</div>}
            {acceptedTasks.slice(0, 6).map(task => (
              <article key={task.id} className="task-row clickable" onClick={() => navigate('/tutor-classes')}>
                <div className="task-row__title">
                  <span className="pill pill--green">{task.estado?.replace('_', ' ') || 'ACEPTADA'}</span>
                  <strong>{task.titulo}</strong>
                </div>
                <div className="task-row__meta">
                  <span>📚 {task.materia}</span>
                  {task.fechaLimite && <span>📅 {parseISODateOnly(task.fechaLimite)}</span>}
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
