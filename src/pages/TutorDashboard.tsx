import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import '../styles/TutorDashboard.css';
import ApiPaymentService from '../service/Api-payment';
import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import DashboardSwitchButton from '../components/DashboardSwitchButton';
import AddRoleButton from '../components/AddRoleButton';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import TutorAvailabilityPage from './TutorAvailabilityPage';
import TutorClassesPage from './TutorClassesPage';
import TutorStudentsPage from './TutorStudentsPage';
import TutorMeetingsNowPage from './TutorMeetingsNowPage';
import type { Specialization } from '../types/specialization';

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
  bio?: string;
  specializations?: Specialization[]; // Ahora objetos Specialization
  credentials?: string[];
}
interface Student {
  id: string;
  name: string;
  email: string;
  educationLevel: string;
  joinDate: string;
  status: 'active' | 'inactive';
  sessionsCompleted: number;
}
interface TutoringRequest {
  id: string;
  studentName: string;
  subject: string;
  description: string;
  requestDate: string;
  status: 'pending' | 'accepted' | 'rejected';
  priority: 'low' | 'medium' | 'high';
}
interface TutoringSession {
  id: string;
  title: string;
  description: string;
  subject: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  maxStudents: number;
  enrolledStudents: number;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export const TutorTopNav: React.FC<{ currentRole?: 'tutor' | 'student' }> = ({ currentRole = 'tutor' }) => {
  return (
    <>
      <DashboardSwitchButton currentRole={currentRole} />
      <AddRoleButton currentRole={currentRole} />
    </>
  );
};

const TutorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();

  const { isProfileComplete, missingFields } = useProfileStatus();
  const [showProfileNotification, setShowProfileNotification] = useState(true);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'my-students' | 'requests' | 'availability' | 'sessions' | 'create-session'>('dashboard');
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  const [students] = useState<Student[]>([
    { id: '1', name: 'Ana García',    email: 'ana@student.com',    educationLevel: 'Pregrado',  joinDate: '2025-09-01', status: 'active',   sessionsCompleted: 8 },
    { id: '2', name: 'Carlos Mendoza',email: 'carlos@student.com', educationLevel: 'Secundaria',joinDate: '2025-08-15', status: 'active',   sessionsCompleted: 12 },
    { id: '3', name: 'Lucía Torres',  email: 'lucia@student.com',  educationLevel: 'Pregrado',  joinDate: '2025-09-10', status: 'inactive', sessionsCompleted: 3 }
  ]);
  const [requests, setRequests] = useState<TutoringRequest[]>([
    { id: '1', studentName: 'María López', subject: 'Matemáticas',   description: 'Necesito ayuda con cálculo integral', requestDate: '2025-09-25', status: 'pending',  priority: 'high'   },
    { id: '2', studentName: 'Pedro Ruiz',  subject: 'Programación',  description: 'Ayuda con React y TypeScript',        requestDate: '2025-09-24', status: 'pending',  priority: 'medium' },
  ]);
  const [sessions, setSessions] = useState<TutoringSession[]>([
    { id: '1', title: 'Introducción al Cálculo', description: 'Conceptos básicos', subject: 'Matemáticas',   date: '2025-09-28', time: '14:00', duration: 60, price: 25000, maxStudents: 5, enrolledStudents: 3, status: 'scheduled' },
    { id: '2', title: 'React Avanzado',          description: 'Hooks y optimización',       subject: 'Programación',  date: '2025-09-30', time: '16:00', duration: 90, price: 35000, maxStudents: 8, enrolledStudents: 6, status: 'scheduled' },
  ]);
  const [newSession, setNewSession] = useState({
    title: '', description: '', subject: '', date: '', time: '', duration: 60, price: 25000, maxStudents: 5
  });

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
      // Cargar balance de tokens al entrar
      const loadBalance = async () => {
        try {
          const token = (auth.user as any)?.id_token ?? auth.user?.access_token;
          if (!token) return;
          const data = await ApiPaymentService.getTutorBalance(token);
          setTokenBalance(data.tokenBalance);
        } catch (e) {
          setTokenBalance(0);
        }
      };
      loadBalance();
      const interval = setInterval(loadBalance, 30000);
      // Escuchar eventos globales para refrescar inmediatamente el balance
      const onRefresh = () => { loadBalance(); };
      window.addEventListener('tokens:refresh', onRefresh);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, userRoles, navigate, auth.user]);

  // Limpieza del listener si el usuario cambia
  useEffect(() => {
    return () => { window.removeEventListener('tokens:refresh', () => {}); };
  }, []);

  const handleLogout = async () => {
    auth.removeUser();
    const clientId = "342s18a96gl2pbaroorqh316l8";
    const logoutUri = "http://localhost:3000";
    const cognitoDomain = "https://us-east-18mvprkbvu.auth.us-east-1.amazoncognito.com";
    globalThis.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };
  const handleEditProfile = () => {
    navigate('/edit-profile', { state: { currentRole: 'tutor' } });
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
          <div className="logo">
            <h2>UpLearn Tutor</h2>
          </div>
          <nav className="main-nav">
            <button className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveSection('dashboard')}><span>📊</span> Dashboard</button>
            <button className={`nav-item ${activeSection === 'my-students' ? 'active' : ''}`} onClick={() => setActiveSection('my-students')}><span>👥</span> Mis Estudiantes</button>
            
            <button className={`nav-item ${activeSection === 'sessions' ? 'active' : ''}`} onClick={() => setActiveSection('sessions')}><span>📬</span> Solicitudes</button>
            <button className={`nav-item ${activeSection === 'availability' ? 'active' : ''}`} onClick={() => setActiveSection('availability')}><span>🗓️</span> Disponibilidad</button>
            <button className={`nav-item ${activeSection === 'requests' ? 'active' : ''}`} onClick={() => setActiveSection('requests')}><span>🎓</span> Mis Clases</button>

            <button className={`nav-item ${activeSection === 'create-session' ? 'active' : ''}`} onClick={() => setActiveSection('create-session')}><span>➕</span> Nueva Clase</button>
          </nav>

          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="token-display" /* solo visual, no compra */>
              <img src="/coin-icon.png" alt="Moneda" className="token-icon" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
              <span className="token-amount">{tokenBalance}</span>
              <span className="token-label">tokens</span>
            </div>
            <div className="user-menu-container">
              <button className="user-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
                <span className="avatar-icon">👨‍🏫</span>
                <span className="user-name">{currentUser.name}</span>
                <span className="dropdown-arrow">▼</span>
              </button>
              {showUserMenu && (
                <div className="user-dropdown">
                  <div className="user-info"><p className="user-email">{currentUser.email}</p><p className="user-role">Tutor Profesional</p></div>
                  <div className="dropdown-divider"></div>
                  <button className="dropdown-item" onClick={handleEditProfile}><span>✏️</span> Editar Perfil</button>
                  <AddRoleButton currentRole="tutor" asMenuItem={true} />
                  <DashboardSwitchButton currentRole="tutor" asMenuItem={true} />
                  <button className="dropdown-item logout" onClick={handleLogout}><span>🚪</span> Cerrar Sesión</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {activeSection === 'dashboard' && (
          <div className="dashboard-content">
            <h1>¡Bienvenido, {currentUser.name}! 👨‍🏫</h1>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <h3>{students.length}</h3>
                  <p>Estudiantes Totales</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📬</div>
                <div className="stat-info">
                  <h3>{requests.filter(r => r.status === 'pending').length}</h3>
                  <p>Solicitudes Pendientes</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🎓</div>
                <div className="stat-info">
                  <h3>{sessions.filter(s => s.status === 'scheduled').length}</h3>
                  <p>Clases Programadas</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-info">
                  <h3>{sessions.reduce((acc, s) => acc + (s.price * s.enrolledStudents), 0).toLocaleString()}</h3>
                  <p>Ingresos Estimados</p>
                </div>
              </div>
            </div>
            <div className="recent-activity">
              <h2>Actividad Reciente</h2>
              <div className="activity-list">
                {requests[0] && (
                  <div className="activity-item">
                    <span className="activity-icon">📝</span>
                    <div className="activity-content">
                      <p><strong>Nueva solicitud:</strong> {requests[0].studentName} - {requests[0].subject}</p>
                      <small>Hace 1 hora</small>
                    </div>
                  </div>
                )}
                <div className="activity-item">
                  <span className="activity-icon">✅</span>
                  <div className="activity-content">
                    <p><strong>Sesión completada:</strong> Introducción al Cálculo</p>
                    <small>Ayer</small>
                  </div>
                </div>
                {students[2] && (
                  <div className="activity-item">
                    <span className="activity-icon">👤</span>
                    <div className="activity-content">
                      <p><strong>Nuevo estudiante:</strong> {students[2].name} se unió</p>
                      <small>Hace 2 días</small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'my-students' && <TutorStudentsPage />}

        {activeSection === 'sessions' && <TutorClassesPage />}

        {activeSection === 'requests' && <TutorMeetingsNowPage />}

        {activeSection === 'availability' && <TutorAvailabilityPage />}
        {activeSection === 'create-session' && <div className="create-session-section"><h1>Crear Nueva Clase ➕</h1></div>}
      </main>
      
    </div>
  );
};

export default TutorDashboard;
