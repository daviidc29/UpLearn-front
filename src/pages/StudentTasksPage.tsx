import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/StudentDashboard.css';
import '../styles/TasksPage.css';

import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import { AppHeader, type ActiveSection } from './StudentDashboard';
import { studentMenuNavigate } from '../utils/StudentMenu';
import WeekCalendar from '../components/WeekCalendar';
import { createReservation, type ScheduleCell } from '../service/Api-scheduler';
import { cancelTask, getMyTasks, getTaskTutorSchedule, type Task, type TutorScheduleSlot } from '../service/Api-tasks';

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
}

type TaskWithUI = Task & { showSchedule?: boolean };

type ScheduleCache = Record<string, TutorScheduleSlot[]>;

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function todayLocalISO(): string { return toISODateLocal(new Date()); }
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toISODateLocal(d);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

const statusStyles: Record<string, { label: string; color: string; bg: string }> = {
  PUBLICADA: { label: 'Publicada', color: '#2563eb', bg: 'rgba(37,99,235,.12)' },
  ACEPTADA: { label: 'Aceptada', color: '#059669', bg: 'rgba(5,150,105,.12)' },
  CANCELADA: { label: 'Cancelada', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  FINALIZADA: { label: 'Finalizada', color: '#0ea5e9', bg: 'rgba(14,165,233,.12)' },
  RECHAZADA: { label: 'Rechazada', color: '#f97316', bg: 'rgba(249,115,22,.12)' },
  EN_PROGRESO: { label: 'En progreso', color: '#6b21a8', bg: 'rgba(107,33,168,.12)' },
};

const StudentTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileBanner, setShowProfileBanner] = useState(true);
  const [tasks, setTasks] = useState<TaskWithUI[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState<string>('');

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayLocalISO()));
  const [scheduleByTask, setScheduleByTask] = useState<ScheduleCache>({});
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    if (isAuthenticated === null || userRoles === null) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    if (needsRoleSelection) { navigate('/role-selection'); return; }
    if (!userRoles?.includes('student')) { navigate('/'); return; }
    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || 'unknown',
        name: auth.user.profile?.name || auth.user.profile?.nickname || 'Usuario',
        email: auth.user.profile?.email || 'No email',
        role: 'student',
      });
    }
  }, [isAuthenticated, userRoles, needsRoleSelection, navigate, auth.user]);

  const token = useMemo(() => (auth.user as any)?.id_token ?? auth.user?.access_token, [auth.user]);

  const loadTasks = async () => {
    if (!token) return;
    try {
      setLoadingTasks(true);
      const data = await getMyTasks(token);
      setTasks(data);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar tus tareas');
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => { if (token) loadTasks(); }, [token]);

  useEffect(() => {
    if (!openTaskId || !token) return;
    const task = tasks.find(t => t.id === openTaskId);
    if (!task || !task.tutorId) return;
    (async () => {
      try {
        setLoadingSchedule(true);
        setScheduleError('');
        const slots = await getTaskTutorSchedule(openTaskId, weekStart, token);
        setScheduleByTask(prev => ({ ...prev, [openTaskId]: slots }));
      } catch (err: any) {
        setScheduleError(err?.message || 'No se pudo cargar el horario del tutor');
      } finally {
        setLoadingSchedule(false);
      }
    })();
  }, [openTaskId, weekStart, token, tasks]);

  const onHeaderSectionChange = (section: ActiveSection) => {
    studentMenuNavigate(navigate, section as any);
  };

  const toggleSchedule = (taskId: string) => {
    setScheduleError('');
    setOpenTaskId(prev => prev === taskId ? null : taskId);
  };

  const handleCancelTask = async (taskId: string) => {
    if (!token) return;
    if (!globalThis.confirm('¿Seguro que quieres cancelar esta tarea?')) return;
    await cancelTask(taskId, token);
    await loadTasks();
    if (openTaskId === taskId) setOpenTaskId(null);
  };

  const handleReserve = async (slot: ScheduleCell) => {
    if (!openTaskId || !token) return;
    const task = tasks.find(t => t.id === openTaskId);
    if (!task || !task.tutorId) return;
    const confirm = globalThis.confirm(`Reservar ${slot.date} ${slot.hour} con el tutor?`);
    if (!confirm) return;
    await createReservation(task.tutorId, slot.date, slot.hour, token);
    alert('Reserva creada. Puedes verla en Mis Reservas.');
  };

  const currentSchedule = openTaskId ? scheduleByTask[openTaskId] || [] : [];
  const weekLabel = `${weekStart} al ${addDays(weekStart, 6)}`;

  if (auth.isLoading || !currentUser) {
    return <div className="full-center">Cargando...</div>;
  }

  return (
    <div className="dashboard-container">
      {!isProfileComplete && missingFields && showProfileBanner && (
        <ProfileIncompleteNotification
          currentRole="student"
          missingFields={missingFields}
          onDismiss={() => setShowProfileBanner(false)}
        />
      )}

      <AppHeader
        currentUser={currentUser}
        activeSection={"my-tasks"}
        onSectionChange={onHeaderSectionChange}
      />

      <main className="dashboard-main">
        <div className="tasks-section">
          <div className="tasks-header-row">
            <h1>Mis tareas 📋</h1>
            <div className="tasks-actions">
              <button className="btn-secondary" type="button" onClick={loadTasks} disabled={loadingTasks}>Actualizar</button>
              <button className="btn-primary" type="button" onClick={() => navigate('/student/tasks/new')}>Publicar nueva</button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          {loadingTasks ? (
            <div className="card">Cargando tareas...</div>
          ) : tasks.length === 0 ? (
            <div className="card">No tienes tareas aún.</div>
          ) : (
            <div className="tasks-grid">
              {tasks.map((task) => {
                const st = statusStyles[task.estado] || { label: task.estado, color: '#374151', bg: 'rgba(55,65,81,.12)' };
                const canCancel = task.estado === 'PUBLICADA' || task.estado === 'ACEPTADA' || task.estado === 'EN_PROGRESO';
                const canSeeSchedule = task.estado === 'ACEPTADA' && task.tutorId;
                const expanded = openTaskId === task.id;
                return (
                  <article key={task.id} className="task-card">
                    <header className="task-header">
                      <h3>{task.titulo}</h3>
                      <div className="task-meta">
                        <span className="priority-badge" style={{ backgroundColor: st.color, color: '#fff' }}>{st.label}</span>
                        <span className="status-badge" style={{ color: st.color, background: st.bg }}>{task.materia}</span>
                      </div>
                    </header>

                    <p className="task-description">{task.descripcion}</p>
                    <div className="task-details">
                      <span>📚 {task.materia || 'Sin materia'}</span>
                      {task.fechaLimite && <span>📅 Límite: {task.fechaLimite}</span>}
                    </div>

                    {task.tutorId && <p className="task-assigned">Tutor asignado: {task.tutorId}</p>}

                    <div className="task-actions">
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => toggleSchedule(task.id)}
                        disabled={!canSeeSchedule}
                        title={canSeeSchedule ? 'Ver horario del tutor' : 'Disponible cuando la tarea esté aceptada'}
                      >
                        Ver horario
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => handleCancelTask(task.id)}
                        disabled={!canCancel}
                        title={canCancel ? 'Cancelar esta tarea' : 'No se puede cancelar en este estado'}
                      >
                        Cancelar tarea
                      </button>
                    </div>

                    {expanded && canSeeSchedule && (
                      <div className="schedule-panel">
                        <div className="week-toolbar">
                          <button className="btn btn-ghost" type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}>« Anterior</button>
                          <div className="week-toolbar__title">Semana {weekLabel}</div>
                          <button className="btn btn-ghost" type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}>Siguiente »</button>
                        </div>
                        {loadingSchedule && <div className="empty-note">Cargando horario...</div>}
                        {scheduleError && <div className="error-text">{scheduleError}</div>}
                        {!loadingSchedule && (
                          <WeekCalendar
                            weekStart={weekStart}
                            cells={currentSchedule as any}
                            mode="student"
                            onSinglePick={(cell) => handleReserve(cell)}
                          />
                        )}
                        <p className="hint-text">Haz clic en un bloque "Disponible" para reservar.</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentTasksPage;
