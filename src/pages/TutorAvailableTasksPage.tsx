import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import '../styles/TasksPage.css';

import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import DashboardSwitchButton from '../components/DashboardSwitchButton';
import AddRoleButton from '../components/AddRoleButton';
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

  const handleLogout = async () => {
    auth.removeUser();
    const clientId = '342s18a96gl2pbaroorqh316l8';
    const logoutUri = 'https://nice-mud-05a4c8f10.3.azurestaticapps.net';
    const cognitoDomain = 'https://us-east-18mvprkbvu.auth.us-east-1.amazoncognito.com';
    globalThis.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading || !currentUser) {
    return <div className="full-center">Cargando...</div>;
  }

  return (
    <div className="tutor-dashboard-container">
      {!isProfileComplete && showProfileNotification && missingFields && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="tutor"
          onDismiss={() => setShowProfileNotification(false)}
        />
      )}

      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo"><h2>UpLearn Tutor</h2></div>
          <nav className="main-nav">
            <button className="nav-item" onClick={() => navigate('/tutor-dashboard')}><span>📊</span> Dashboard</button>
            <button className="nav-item active" onClick={() => navigate('/tutor/tasks/available')}><span>📋</span> Tareas disponibles</button>
          </nav>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <DashboardSwitchButton currentRole="tutor" />
            <AddRoleButton currentRole="tutor" />
            <div className="user-menu-container">
              <button className="user-avatar" onClick={handleLogout}><span className="avatar-icon">👨‍🏫</span><span className="user-name">{currentUser.name}</span></button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-content">
          <div className="tasks-header-row">
            <h1>Tareas de estudiantes</h1>
            <div className="tasks-actions">
              <button className="btn-secondary" type="button" onClick={loadTasks} disabled={loading}>Actualizar</button>
              <button className="btn-ghost" type="button" onClick={() => navigate('/tutor-dashboard')}>Volver</button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}

          {loading ? (
            <div className="card">Cargando tareas...</div>
          ) : tasks.length === 0 ? (
            <div className="card">No hay tareas disponibles por ahora.</div>
          ) : (
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
      </main>
    </div>
  );
};

export default TutorAvailableTasksPage;
