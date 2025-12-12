import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import '../styles/TasksPage.css';

import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import { acceptTask, getAvailableTasks, type Task } from '../service/Api-tasks';

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
}

const TutorAvailableTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileNotification, setShowProfileNotification] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
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

  const loadTasks = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const data = await getAvailableTasks(token);
      setTasks(data);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las tareas disponibles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) loadTasks(); }, [token]);

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    await acceptTask(taskId, token);
    setSuccess('Tarea aceptada. Puedes ver la reserva asociada en tu agenda.');
    await loadTasks();
  };

  if (auth.isLoading || !currentUser) {
    return <div className="full-center">Cargando...</div>;
  }

  return (
    <>
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
              <button className="btn-secondary" type="button" onClick={loadTasks} disabled={loading}>Actualizar</button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}

          {loading && <div className="card">Cargando tareas...</div>}
          {!loading && tasks.length === 0 && <div className="card">No hay tareas disponibles por ahora.</div>}
          {!loading && tasks.length > 0 && (
            <div className="tasks-grid">
              {tasks.map((task) => (
                <article key={task.id} className="task-card">
                  <header className="task-header">
                    <h3>{task.titulo}</h3>
                    <div className="task-meta">
                      <span className="status-badge" style={{ color: '#2563eb', background: 'rgba(37,99,235,.12)' }}>PUBLICADA</span>
                      {task.fechaLimite && <span className="status-badge">Límite: {task.fechaLimite}</span>}
                    </div>
                  </header>
                  <p className="task-description">{task.descripcion}</p>
                  <div className="task-details">
                    <span>📚 {task.materia}</span>
                    <span>Estudiante: {task.studentId}</span>
                  </div>
                  <div className="task-actions">
                    <button className="btn-primary" type="button" onClick={() => handleAccept(task.id)}>Aceptar tarea</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
    </>
  );
};

export default TutorAvailableTasksPage;
