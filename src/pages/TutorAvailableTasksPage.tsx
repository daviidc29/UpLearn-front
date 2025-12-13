import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import '../styles/TasksPage.css';

import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import TutorLayout from '../layouts/TutorLayout';

import { acceptTask, getAvailableTasks, getMyTasks, type Task, type TaskStatus } from '../service/Api-tasks';
import { ENV } from '../utils/env';

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
}

type PublicProfile = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

function parseISODateOnly(s?: string | null): string {
  if (!s) return '';
  return s.includes('T') ? s.split('T')[0] : s;
}

function isFinalLike(status?: TaskStatus | null): boolean {
  const s = (status ?? '').toString().toUpperCase();
  return s === 'FINALIZADA' || s === 'CANCELADA' || s === 'RECHAZADA';
}

function isActiveTask(status?: TaskStatus | null): boolean {
  const s = (status ?? '').toString().toUpperCase();
  return s === 'ACEPTADA' || s === 'EN_PROGRESO';
}

// ---- estilos como StudentTasksPage ----
const statusStyles: Record<string, { label: string; color: string; bg: string }> = {
  PUBLICADA: { label: 'Publicada', color: '#2563eb', bg: 'rgba(37,99,235,.12)' },
  ACEPTADA: { label: 'Aceptada', color: '#059669', bg: 'rgba(5,150,105,.12)' },
  CANCELADA: { label: 'Cancelada', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  FINALIZADA: { label: 'Finalizada', color: '#0ea5e9', bg: 'rgba(14,165,233,.12)' },
  RECHAZADA: { label: 'Rechazada', color: '#f97316', bg: 'rgba(249,115,22,.12)' },
  EN_PROGRESO: { label: 'En progreso', color: '#6b21a8', bg: 'rgba(107,33,168,.12)' },
};

function shortText(s?: string | null, max = 140) {
  const txt = (s ?? '').trim();
  if (!txt) return '';
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
}

// ---- helpers de perfiles para nombres ----
async function fetchProfilesForIds(ids: string[], token: string): Promise<Record<string, PublicProfile>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const reqs = unique.map((id) =>
    fetch(`${ENV.USERS_BASE}${ENV.USERS_PROFILE_PATH}?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );

  const results = await Promise.allSettled(reqs);
  const map: Record<string, PublicProfile> = {};
  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value) map[unique[i]] = res.value as PublicProfile;
  });
  return map;
}

const TutorAvailableTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();

  // tu hook suele traer también needsRoleSelection (como en student)
  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow() as any;
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileNotification, setShowProfileNotification] = useState(true);

  const [available, setAvailable] = useState<Task[]>([]);
  const [accepted, setAccepted] = useState<Task[]>([]);
  const [names, setNames] = useState<Record<string, PublicProfile>>({});

  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // modal de detalles (como el modal del horario del estudiante)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated === null || userRoles === null) return;

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (needsRoleSelection) {
      navigate('/role-selection');
      return;
    }
    if (userRoles && !userRoles.includes('tutor')) {
      navigate('/');
      return;
    }

    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || 'unknown',
        name: auth.user.profile?.name || auth.user.profile?.nickname || 'Tutor',
        email: auth.user.profile?.email || 'No email',
        role: 'tutor',
      });
    }
  }, [isAuthenticated, userRoles, needsRoleSelection, navigate, auth.user]);

  const token = useMemo(() => (auth.user as any)?.id_token ?? auth.user?.access_token, [auth.user]);

  const load = async () => {
    if (!token || !currentUser) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const [availRes, myRes] = await Promise.allSettled([getAvailableTasks(token), getMyTasks(token)]);

      const availAll = availRes.status === 'fulfilled' ? availRes.value : [];
      const mineAll = myRes.status === 'fulfilled' ? myRes.value : [];

      // panel izq: solo publicadas
      const avail = availAll.filter((t) => (t.estado ?? '').toString().toUpperCase() === 'PUBLICADA');
      setAvailable(avail);

      // panel der: mis tareas activas (aceptada/en_progreso) del tutor actual
      const mine = mineAll.filter(
        (t) => isActiveTask(t.estado) && t.tutorId === currentUser.userId && !isFinalLike(t.estado)
      );
      setAccepted(mine);

      // Perfiles para mostrar el nombre del estudiante
      const ids = [...avail.map((t) => t.studentId), ...mine.map((t) => t.studentId)].filter(Boolean) as string[];
      const profiles = await fetchProfilesForIds(ids, token);
      setNames(profiles);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las tareas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && currentUser) load();
  }, [token, currentUser]);

  const openDetails = (taskId: string) => {
    setOpenTaskId(taskId);
    setShowTaskModal(true);
  };

  const closeDetails = () => {
    setShowTaskModal(false);
    setOpenTaskId(null);
  };

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    try {
      setAcceptingId(taskId);
      setError('');
      setSuccess('');
      await acceptTask(taskId, token);
      setSuccess('✅ Tarea aceptada. Ya aparece en tus tareas.');
      await load();

      closeDetails();
    } catch (e: any) {
      setError(e?.message || 'No se pudo aceptar la tarea');
    } finally {
      setAcceptingId(null);
    }
  };

  const allTasksForModal = useMemo(() => [...available, ...accepted], [available, accepted]);
  const taskInModal = useMemo(() => allTasksForModal.find((t) => t.id === openTaskId) || null, [allTasksForModal, openTaskId]);
  const studentName = taskInModal?.studentId ? (names[taskInModal.studentId]?.name || taskInModal.studentId) : '';

  if (auth.isLoading || !currentUser) return <div className="full-center">Cargando...</div>;

  return (
    <TutorLayout active="available-tasks">
      {!isProfileComplete && showProfileNotification && missingFields && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="tutor"
          onDismiss={() => setShowProfileNotification(false)}
        />
      )}

      <div className="dashboard-content">
        <div className="tasks-header-row">
          <h1>Tareas de estudiantes 📋</h1>
          <div className="tasks-actions">
            <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
              Actualizar
            </button>
            <button className="btn-link" type="button" onClick={() => navigate('/tutor-classes')}>
              Ir a agenda →
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}

        {/* Sección 1: Solicitudes publicadas */}
        <section className="tasks-section" style={{ marginTop: 12 }}>
          <div className="tasks-header-row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Solicitudes publicadas</h2>
            <span className="muted" style={{ opacity: 0.9 }}>
              {available.length} disponibles
            </span>
          </div>

          {loading ? (
            <div className="card">Cargando solicitudes...</div>
          ) : available.length === 0 ? (
            <div className="card muted">No hay solicitudes por ahora.</div>
          ) : (
            <div className="tasks-grid">
              {available.map((task) => {
                const st = statusStyles[(task.estado ?? 'PUBLICADA').toString().toUpperCase()] || {
                  label: task.estado ?? 'PUBLICADA',
                  color: '#374151',
                  bg: 'rgba(55,65,81,.12)',
                };

                const student = task.studentId ? (names[task.studentId]?.name || task.studentId) : 'Estudiante';

                return (
                  <article key={task.id} className="task-card">
                    <header className="task-header">
                      <h3>{task.titulo}</h3>
                      <div className="task-meta">
                        <span className="priority-badge" style={{ backgroundColor: st.color, color: '#fff' }}>
                          {st.label}
                        </span>
                        <span className="status-badge" style={{ color: st.color, background: st.bg }}>
                          {task.materia || 'Sin materia'}
                        </span>
                      </div>
                    </header>

                    <p className="task-description">{shortText(task.descripcion, 160) || 'Sin descripción.'}</p>

                    <div className="task-details">
                      <span>👤 {student}</span>
                      {task.fechaLimite && <span>📅 Límite: {parseISODateOnly(task.fechaLimite)}</span>}
                    </div>

                    <div className="task-actions">
                      <button className="btn-secondary" type="button" onClick={() => openDetails(task.id)}>
                        Ver detalles
                      </button>

                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => handleAccept(task.id)}
                        disabled={!!acceptingId}
                        title="Aceptar esta tarea"
                      >
                        {acceptingId === task.id ? 'Aceptando...' : 'Aceptar tarea'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Sección 2: Mis tareas aceptadas / en progreso */}
        <section className="tasks-section" style={{ marginTop: 18 }}>
          <div className="tasks-header-row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Mis tareas activas</h2>
            <span className="muted" style={{ opacity: 0.9 }}>
              {accepted.length} en curso
            </span>
          </div>

          {loading ? (
            <div className="card">Cargando mis tareas...</div>
          ) : accepted.length === 0 ? (
            <div className="card muted">Aún no tienes tareas aceptadas.</div>
          ) : (
            <div className="tasks-grid">
              {accepted.map((task) => {
                const st = statusStyles[(task.estado ?? 'ACEPTADA').toString().toUpperCase()] || {
                  label: task.estado ?? 'ACEPTADA',
                  color: '#374151',
                  bg: 'rgba(55,65,81,.12)',
                };

                const student = task.studentId ? (names[task.studentId]?.name || task.studentId) : 'Estudiante';

                return (
                  <article key={task.id} className="task-card">
                    <header className="task-header">
                      <h3>{task.titulo}</h3>
                      <div className="task-meta">
                        <span className="priority-badge" style={{ backgroundColor: st.color, color: '#fff' }}>
                          {st.label}
                        </span>
                        <span className="status-badge" style={{ color: st.color, background: st.bg }}>
                          {task.materia || 'Sin materia'}
                        </span>
                      </div>
                    </header>

                    <p className="task-description">{shortText(task.descripcion, 160) || 'Sin descripción.'}</p>

                    <div className="task-details">
                      <span>👤 {student}</span>
                      {task.fechaLimite && <span>📅 Límite: {parseISODateOnly(task.fechaLimite)}</span>}
                    </div>

                    <div className="task-actions">
                      <button className="btn-secondary" type="button" onClick={() => openDetails(task.id)}>
                        Ver detalles
                      </button>

                      <button className="btn-primary" type="button" onClick={() => navigate('/availability')}>
                        Ir a agenda
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* MODAL DETALLES (estilo similar al del estudiante) */}
        {showTaskModal && taskInModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <div className="modal-header">
                <h3>Detalle de la tarea</h3>
                <button className="btn-secondary" type="button" onClick={closeDetails}>
                  Cerrar
                </button>
              </div>

              <div className="modal-body">
                {(() => {
                  const st = statusStyles[(taskInModal.estado ?? '').toString().toUpperCase()] || {
                    label: taskInModal.estado ?? '—',
                    color: '#374151',
                    bg: 'rgba(55,65,81,.12)',
                  };

                  const isPublished = (taskInModal.estado ?? '').toString().toUpperCase() === 'PUBLICADA';
                  const isMineActive = isActiveTask(taskInModal.estado);

                  return (
                    <>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="priority-badge" style={{ backgroundColor: st.color, color: '#fff' }}>
                          {st.label}
                        </span>
                        <span className="status-badge" style={{ color: st.color, background: st.bg }}>
                          {taskInModal.materia || 'Sin materia'}
                        </span>
                      </div>

                      <h2 style={{ marginTop: 12, marginBottom: 6 }}>{taskInModal.titulo}</h2>

                      <div className="task-details" style={{ marginTop: 8 }}>
                        <span>👤 {studentName || 'Estudiante'}</span>
                        {taskInModal.fechaLimite && <span>📅 Límite: {parseISODateOnly(taskInModal.fechaLimite)}</span>}
                      </div>

                      <div className="card" style={{ marginTop: 12 }}>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {taskInModal.descripcion?.trim() || 'Sin descripción.'}
                        </p>
                      </div>

                      <div className="task-actions" style={{ marginTop: 12 }}>
                        {isPublished && (
                          <button
                            className="btn-primary"
                            type="button"
                            onClick={() => handleAccept(taskInModal.id)}
                            disabled={!!acceptingId}
                          >
                            {acceptingId === taskInModal.id ? 'Aceptando...' : 'Aceptar tarea'}
                          </button>
                        )}

                        {isMineActive && (
                          <button className="btn-primary" type="button" onClick={() => navigate('/tutor-classes')}>
                            Ir a agenda
                          </button>
                        )}

                        {!isPublished && !isMineActive && (
                          <button className="btn-secondary" type="button" onClick={() => navigate('/tutor-classes')}>
                            Ver agenda
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </TutorLayout>
  );
};

export default TutorAvailableTasksPage;
