import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';

import TutorLayout from '../layouts/TutorLayout';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';

import TutorAvailabilityPage from './TutorAvailabilityPage';
import TutorClassesPage from './TutorClassesPage';
import TutorStudentsPage from './TutorStudentsPage';
import TutorMeetingsNowPage from './TutorMeetingsNowPage';
import TutorAvailableTasksPage from './TutorAvailableTasksPage';

import ApiPaymentService from '../service/Api-payment';
import { getTutorReservations, Reservation } from '../service/Api-scheduler';
import { getAvailableTasks, Task } from '../service/Api-tasks';

type Tab = 'dashboard' | 'my-students' | 'sessions' | 'availability' | 'requests' | 'available-tasks';

const COP_PER_TOKEN = 1700;

const TutorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [showProfileNotification, setShowProfileNotification] = useState(true);

  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tabFromQuery = (search.get('tab') as Tab) || 'dashboard';
  const [active, setActive] = useState<Tab>(tabFromQuery);

  const [loadingData, setLoadingData] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);

  useEffect(() => setActive(tabFromQuery), [tabFromQuery]);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (userRoles && !userRoles.includes('tutor')) { navigate('/'); return; }
  }, [isAuthenticated, userRoles, navigate]);

  useEffect(() => {
    if (active !== 'dashboard' || !auth.user?.access_token) return;

    const fetchData = async () => {
      setLoadingData(true);
      const token = auth.user?.access_token;

      try {
        const now = new Date();
        const pastDate = new Date(); pastDate.setDate(now.getDate() - 30);
        const futureDate = new Date(); futureDate.setDate(now.getDate() + 30);
        
        const [walletData, reservationsData, tasksData] = await Promise.all([
          ApiPaymentService.getTutorBalance(token).catch(() => ({ tokenBalance: 0 })),
          getTutorReservations(pastDate.toISOString(), futureDate.toISOString(), token).catch(() => []),
          getAvailableTasks(token).catch(() => [])
        ]);

        setTokenBalance(walletData.tokenBalance || 0);

        const upcoming = reservationsData.filter(r => 
          (r.status === 'ACEPTADO' || r.status === 'ACTIVA') && 
          new Date(r.date + 'T' + r.start) > new Date()
        ).sort((a, b) => new Date(a.date + 'T' + a.start).getTime() - new Date(b.date + 'T' + b.start).getTime());
        
        setUpcomingReservations(upcoming);

        const completed = reservationsData.filter(r => r.status === 'FINALIZADA').length;
        setCompletedCount(completed);

        setAvailableTasks(tasksData || []);

      } catch (error) {
        console.error("Error cargando dashboard:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [active, auth.user]);

  if (auth.isLoading) return <div className="full-center">Cargando...</div>;

  const renderDashboardContent = () => {
    const estimatedCop = (tokenBalance * COP_PER_TOKEN).toLocaleString('es-CO');

    return (
      <div className="dashboard-content fade-in">
        <h1>¡Bienvenido, {auth.user?.profile?.name || 'Tutor'}! 👨‍🏫</h1>

        <div className="stats-grid">
          
          {/* Tarjeta 1: Tareas Disponibles */}
          <div className="stat-card clickable" onClick={() => navigate('/tutor/tasks/available')}>
            <div className="stat-icon icon-purple">📝</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : availableTasks.length}</h3>
              <p>Tareas Disponibles</p>
            </div>
          </div>

          {/* Tarjeta 2: Próximas Clases */}
          <div className="stat-card clickable" onClick={() => navigate('/tutor-classes')}>
            <div className="stat-icon icon-blue">📅</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : upcomingReservations.length}</h3>
              <p>Clases Próximas</p>
            </div>
          </div>

          {/* Tarjeta 3: Clases Completadas (Mes) */}
          <div className="stat-card">
            <div className="stat-icon icon-green">✅</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : completedCount}</h3>
              <p>Clases Finalizadas (30d)</p>
            </div>
          </div>

           {/* Tarjeta 4: Finanzas */}
           <div className="stat-card">
            <div className="stat-icon icon-yellow">💰</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : tokenBalance} <small style={{fontSize:'0.6em', color:'#666'}}>Tokens</small></h3>
              <p>≈ ${estimatedCop} COP</p>
            </div>
          </div>
        </div>

        {/* --- ACTIVIDAD RECIENTE --- */}
        <div className="recent-activity">
          <h2>Actividad y Recordatorios</h2>
          <div className="activity-list">
            
            {loadingData && <p className="text-muted">Cargando actividad...</p>}

            {!loadingData && upcomingReservations.length === 0 && availableTasks.length === 0 && (
              <div className="empty-state">
                <p>No tienes actividad pendiente por ahora.</p>
              </div>
            )}

            {/* Mostrar próximas 2 reservas */}
            {upcomingReservations.slice(0, 2).map(res => (
              <div key={res.id} className="activity-item clickable" onClick={() => navigate('/tutor-classes')}>
                <div className="activity-icon-wrapper bg-blue-light">
                  <span className="activity-icon">🎓</span>
                </div>
                <div className="activity-content">
                  <p><strong>Clase Próxima:</strong> {res.studentName || 'Estudiante'}</p>
                  <small>{res.date} a las {res.start} - {res.status}</small>
                </div>
                <div className="activity-action">
                  <button className="btn-small">Ver</button>
                </div>
              </div>
            ))}

            {/* Mostrar últimas 2 tareas disponibles */}
            {availableTasks.slice(0, 3).map(task => (
              <div key={task.id} className="activity-item clickable" onClick={() => navigate('/tutor/tasks/available')}>
                <div className="activity-icon-wrapper bg-purple-light">
                  <span className="activity-icon">📋</span>
                </div>
                <div className="activity-content">
                  <p><strong>Nueva Tarea:</strong> {task.titulo}</p>
                  <small>{task.materia} - Vence: {task.fechaLimite ? task.fechaLimite.split('T')[0] : 'Sin fecha'}</small>
                </div>
                 <div className="activity-action">
                  <button className="btn-small btn-outline">Aplicar</button>
                </div>
              </div>
            ))}

          </div>
        </div>
      </div>
    );
  };

  return (
    <TutorLayout active={active}>
      {!isProfileComplete && showProfileNotification && missingFields && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="tutor"
          onDismiss={() => setShowProfileNotification(false)}
        />
      )}

      {active === 'dashboard' && renderDashboardContent()}
      {active === 'my-students' && <TutorStudentsPage />}
      {active === 'sessions' && <TutorClassesPage />}
      {active === 'requests' && <TutorMeetingsNowPage />}
      {active === 'availability' && <TutorAvailabilityPage />}
      {active === 'available-tasks' && <TutorAvailableTasksPage />}
    </TutorLayout>
  );
};

export default TutorDashboard;