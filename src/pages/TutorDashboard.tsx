import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';

// Componentes y Layouts
import TutorLayout from '../layouts/TutorLayout';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';

// Sub-páginas (pestañas)
import TutorAvailabilityPage from './TutorAvailabilityPage';
import TutorClassesPage from './TutorClassesPage';
import TutorStudentsPage from './TutorStudentsPage';
import TutorMeetingsNowPage from './TutorMeetingsNowPage';
import TutorAvailableTasksPage from './TutorAvailableTasksPage';

// Servicios
import ApiPaymentService from '../service/Api-payment';
import { getTutorReservations, Reservation } from '../service/Api-scheduler';
import { getAvailableTasks, Task } from '../service/Api-tasks';

type Tab = 'dashboard' | 'my-students' | 'sessions' | 'availability' | 'requests' | 'available-tasks';

const COP_PER_TOKEN = 1700;

// Utilidad para limpiar fechas (Evita error 500 en backend)
function toSimpleDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TutorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [showProfileNotification, setShowProfileNotification] = useState(true);

  // Manejo de Pestañas
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tabFromQuery = (search.get('tab') as Tab) || 'dashboard';
  const [active, setActive] = useState<Tab>(tabFromQuery);

  // Estado para Datos Dinámicos
  const [loadingData, setLoadingData] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [upcomingReservations, setUpcomingReservations] = useState<Reservation[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);

  useEffect(() => setActive(tabFromQuery), [tabFromQuery]);

  // Protección de Ruta
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (userRoles && !userRoles.includes('tutor')) { navigate('/'); return; }
  }, [isAuthenticated, userRoles, navigate]);

  // Carga de Datos Reales (Robusta ante fallos)
  useEffect(() => {
    if (active !== 'dashboard' || !auth.user?.access_token) return;

    const fetchData = async () => {
      setLoadingData(true);
      const token = auth.user?.access_token;

      try {
        // 1. Fechas limpias para evitar Error 500
        const now = new Date();
        const pastDate = new Date(); pastDate.setDate(now.getDate() - 30);
        const futureDate = new Date(); futureDate.setDate(now.getDate() + 30);
        
        const fromStr = toSimpleDate(pastDate);
        const toStr = toSimpleDate(futureDate);

        // 2. Ejecutar en paralelo pero capturando errores individuales (allSettled)
        // Esto evita que el error 403 de la wallet bloquee las reservas
        const [walletResult, reservationsResult, tasksResult] = await Promise.allSettled([
          ApiPaymentService.getTutorBalance(token),
          getTutorReservations(fromStr, toStr, token),
          getAvailableTasks(token)
        ]);

        // 3. Procesar Balance (Si falla, asumimos 0)
        if (walletResult.status === 'fulfilled') {
          setTokenBalance(walletResult.value.tokenBalance || 0);
        } else {
          console.warn('Wallet fetch falló (posiblemente 403, usuario nuevo):', walletResult.reason);
          setTokenBalance(0);
        }

        // 4. Procesar Reservas
        if (reservationsResult.status === 'fulfilled') {
          const data = reservationsResult.value;
          const upcoming = data.filter(r => 
            (r.status === 'ACEPTADO' || r.status === 'ACTIVA') && 
            new Date(`${r.date}T${r.start}`) > new Date()
          ).sort((a, b) => new Date(`${a.date}T${a.start}`).getTime() - new Date(`${b.date}T${b.start}`).getTime());
          
          setUpcomingReservations(upcoming);
          setCompletedCount(data.filter(r => r.status === 'FINALIZADA').length);
        } else {
            console.error('Error cargando reservas:', reservationsResult.reason);
        }

        // 5. Procesar Tareas
        if (tasksResult.status === 'fulfilled') {
          setAvailableTasks(tasksResult.value || []);
        }

      } catch (error) {
        console.error("Error crítico en dashboard:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [active, auth.user]);

  if (auth.isLoading) return <div className="full-center">Cargando...</div>;

  // Renderizado del Dashboard Principal
  const renderDashboardContent = () => {
    const estimatedCop = (tokenBalance * COP_PER_TOKEN).toLocaleString('es-CO');

    return (
      <div className="dashboard-content fade-in">
        <h1>¡Bienvenido, {auth.user?.profile?.name || 'Tutor'}! 👨‍🏫</h1>

        {/* --- GRID DE ESTADÍSTICAS --- */}
        <div className="stats-grid">
          
          <div className="stat-card clickable" onClick={() => navigate('/tutor/tasks/available')}>
            <div className="stat-icon icon-purple">📝</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : availableTasks.length}</h3>
              <p>Tareas Disponibles</p>
            </div>
          </div>

          <div className="stat-card clickable" onClick={() => navigate('/tutor-classes')}>
            <div className="stat-icon icon-blue">📅</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : upcomingReservations.length}</h3>
              <p>Clases Próximas</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon icon-green">✅</div>
            <div className="stat-info">
              <h3>{loadingData ? '...' : completedCount}</h3>
              <p>Clases Finalizadas (30d)</p>
            </div>
          </div>

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