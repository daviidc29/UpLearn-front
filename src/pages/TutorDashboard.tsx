// src/pages/TutorDashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/TutorDashboard.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';

import TutorLayout from '../layouts/TutorLayout';
import TutorAvailabilityPage from './TutorAvailabilityPage';
import TutorClassesPage from './TutorClassesPage';
import TutorStudentsPage from './TutorStudentsPage';
import TutorMeetingsNowPage from './TutorMeetingsNowPage';
import TutorAvailableTasksPage from './TutorAvailableTasksPage';

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

  useEffect(() => setActive(tabFromQuery), [tabFromQuery]);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (userRoles && !userRoles.includes('tutor')) { navigate('/'); return; }
  }, [isAuthenticated, userRoles, navigate]);

  if (auth.isLoading) return <div className="full-center">Cargando...</div>;

  // Contenidos de dashboard "principal"
  const students = [
    { id: '1', name: 'Ana García', sessionsCompleted: 8 },
    { id: '2', name: 'Carlos Mendoza', sessionsCompleted: 12 },
    { id: '3', name: 'Lucía Torres', sessionsCompleted: 3 }
  ];
  const requests = [
    { id: '1', studentName: 'María López', subject: 'Matemáticas',  status: 'pending' },
    { id: '2', studentName: 'Pedro Ruiz',  subject: 'Programación', status: 'pending' },
  ];
  const sessions = [
    { id: '1', title: 'Introducción al Cálculo', price: 25000, enrolledStudents: 3, status: 'scheduled' },
    { id: '2', title: 'React Avanzado',          price: 35000, enrolledStudents: 6, status: 'scheduled' },
  ];

  return (
    <TutorLayout active={active}>
      {!isProfileComplete && showProfileNotification && missingFields && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="tutor"
          onDismiss={() => setShowProfileNotification(false)}
        />
      )}

      {active === 'dashboard' && (
        <div className="dashboard-content">
          <h1>¡Bienvenido, {auth.user?.profile?.name || 'Tutor'}! 👨‍🏫</h1>

          <div className="stats-grid">
            <div className="stat-card"><div className="stat-icon">👥</div><div className="stat-info">
              <h3>{students.length}</h3><p>Estudiantes Totales</p></div></div>
            <div className="stat-card"><div className="stat-icon">📬</div><div className="stat-info">
              <h3>{requests.length}</h3><p>Solicitudes Pendientes</p></div></div>
            <div className="stat-card"><div className="stat-icon">🎓</div><div className="stat-info">
              <h3>{sessions.filter(s => s.status === 'scheduled').length}</h3><p>Clases Programadas</p></div></div>
            <div className="stat-card"><div className="stat-icon">💰</div><div className="stat-info">
              <h3 style={{ fontSize: 20 }}>Tus tokens × {COP_PER_TOKEN.toLocaleString('es-CO')} COP</h3>
              <p>Ingresos estimados (equivalencia)</p>
            </div></div>
          </div>

          <div className="recent-activity">
            <h2>Actividad Reciente</h2>
            <div className="activity-list">
              <div className="activity-item">
                <span className="activity-icon">📝</span>
                <div className="activity-content">
                  <p><strong>Nueva solicitud:</strong> {requests[0].studentName} - {requests[0].subject}</p>
                  <small>Hace 1 hora</small>
                </div>
              </div>
              <div className="activity-item">
                <span className="activity-icon">✅</span>
                <div className="activity-content">
                  <p><strong>Sesión completada:</strong> Introducción al Cálculo</p>
                  <small>Ayer</small>
                </div>
              </div>
              <div className="activity-item">
                <span className="activity-icon">👤</span>
                <div className="activity-content">
                  <p><strong>Nuevo estudiante:</strong> Lucía Torres se unió</p>
                  <small>Hace 2 días</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {active === 'my-students' && <TutorStudentsPage />}
      {active === 'sessions' && <TutorClassesPage />}
      {active === 'requests' && <TutorMeetingsNowPage />}
      {active === 'availability' && <TutorAvailabilityPage />}
      {active === 'available-tasks' && <TutorAvailableTasksPage />}
    </TutorLayout>
  );
};

export default TutorDashboard;
