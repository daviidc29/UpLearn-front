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

// ---- helpers de perfiles para nombres ----
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

const TutorAvailableTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileNotification, setShowProfileNotification] = useState(true);

  const [available, setAvailable] = useState<Task[]>([]);
  const [accepted, setAccepted] = useState<Task[]>([]);
  const [names, setNames] = useState<Record<string, PublicProfile>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (userRoles && !userRoles.includes('tutor')) { navigate('/'); return; }
    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || 'unknown',
        name: auth.user.profile?.name || auth.user.profile?.nickname || 'Tutor',
        email: auth.user.profile?.email || 'No email',
        role: 'tutor',
      });
    }
  }, [isAuthenticated, userRoles, navigate, auth.user]);

  const token = useMemo(() => (auth.user as any)?.id_token ?? auth.user?.access_token, [auth.user]);

  const load = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const [availRes, myRes] = await Promise.allSettled([
        getAvailableTasks(token),
        getMyTasks(token)
      ]);

      const avail = (availRes.status === 'fulfilled' ? availRes.value : []).filter(t => t.estado === 'PUBLICADA');
      setAvailable(avail);

      const mineRaw = (myRes.status === 'fulfilled' ? myRes.value : []);
      const mine = mineRaw.filter(t => isActiveTask(t.estado) && t.tutorId === currentUser?.userId);
      setAccepted(mine);

      // Nombres (studentId)
      const ids = [
        ...avail.map(t => t.studentId),
        ...mine.map(t => t.studentId),
      ].filter(Boolean);

      const profiles = await fetchProfilesForIds(ids, token);
      setNames(profiles);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las tareas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token && currentUser) load(); }, [token, currentUser]);

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    try {
      await acceptTask(taskId, token);
      setSuccess('Tarea aceptada. Puedes verla en tu agenda.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo aceptar la tarea');
    }
  };

  if (auth.isLoading || !currentUser) {
    return <div className="full-center">Cargando...</div>;
  }

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
          <h1>Tareas de estudiantes</h1>
          <div className="tasks-actions">
            <button className="btn-secondary" type="button" onClick={load} disabled={loading}>Actualizar</button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}

        <section className="tasks-dual-pane">
          {/* IZQUIERDA: Solicitudes PUBLICADAS */}
          <div className="tasks-pane">
            <header className="tasks-pane__header">
              <h3>Solicitudes de estudiantes</h3>
            </header>
            <div className="tasks-list">
              {loading && <div className="card">Cargando solicitudes...</div>}
              {!loading && available.length === 0 && <div className="card muted">No hay solicitudes por ahora.</div>}
              {!loading && available.map(task => (
                <article key={task.id} className="task-row">
                  <div className="task-row__title">
                    <span className="pill pill--purple">PUBLICADA</span>
                    <strong>{task.titulo}</strong>
                  </div>
                  <div className="task-row__meta">
                    <span>📚 {task.materia}</span>
                    {task.fechaLimite && <span>⏳ {parseISODateOnly(task.fechaLimite)}</span>}
                    <span>👤 {names[task.studentId]?.name || task.studentId}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="btn-primary" type="button" onClick={() => handleAccept(task.id)}>Aceptar tarea</button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* DERECHA: Tareas aceptadas/en progreso */}
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
              {loading && <div className="card">Cargando mis tareas...</div>}
              {!loading && accepted.length === 0 && <div className="card muted">Aún no tienes tareas aceptadas.</div>}
              {!loading && accepted.map(task => (
                <article key={task.id} className="task-row clickable" onClick={() => navigate('/tutor-classes')}>
                  <div className="task-row__title">
                    <span className="pill pill--green">{task.estado?.replace('_', ' ') || 'ACEPTADA'}</span>
                    <strong>{task.titulo}</strong>
                  </div>
                  <div className="task-row__meta">
                    <span>📚 {task.materia}</span>
                    {task.fechaLimite && <span>📅 {parseISODateOnly(task.fechaLimite)}</span>}
                    <span>👤 {names[task.studentId]?.name || task.studentId}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </TutorLayout>
  );
};

export default TutorAvailableTasksPage;
