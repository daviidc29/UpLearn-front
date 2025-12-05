import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import './App.css';
import HomePage from './pages/HomePage';
import StudentDashboard from './pages/StudentDashboard';
import TutorDashboard from './pages/TutorDashboard';
import EditProfilePage from './pages/EditProfilePage';
import RoleSelectionPage from './pages/RoleSelectionPage';
import { useAuthFlow } from './utils/useAuthFlow';
import TutorAvailabilityPage from './pages/TutorAvailabilityPage';
import TutorClassesPage from './pages/TutorClassesPage';
import ProfileViewPage from './pages/ProfileViewPage';
import BookTutorPage from './pages/BookTutorPage';
import TutorMeetingsNowPage from './pages/TutorMeetingsNowPage';
import CallPage from './pages/CallPage';
import StudentReservationsPage from './pages/StudentReservationsPage';
import StudentFindsTutorsPage from './pages/StudentFindsTutorsPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentCancelPage from './pages/PaymentCancelPage';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles
}) => {
  const { isLoading, isAuthenticated, userRoles, needsRoleSelection } = useAuthFlow();

  console.log('🛡️ ProtectedRoute check:', {
    isAuthenticated,
    isLoading,
    allowedRoles,
    userRoles,
    needsRoleSelection
  });

  // Mientras se carga, mostrar indicador
  if (isLoading) {
    console.log('⏳ ProtectedRoute: Cargando...');
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        ⏳ Verificando permisos...
      </div>
    );
  }

  // No autenticado - redirigir a home
  if (!isAuthenticated) {
    console.log('🔒 ProtectedRoute: Not authenticated, redirecting to home');
    return <Navigate to="/" replace />;
  }

  // Necesita selección de roles - redirigir a role selection
  if (needsRoleSelection) {
    console.log('🔄 ProtectedRoute: User needs role selection, redirecting');
    return <Navigate to="/role-selection" replace />;
  }

  // Verificar roles específicos si se especificaron
  if (allowedRoles && allowedRoles.length > 0) {
    console.log('🎭 ProtectedRoute: User roles:', userRoles, 'Allowed roles:', allowedRoles);

    if (!userRoles || !userRoles.some(role => allowedRoles.includes(role))) {
      console.log('❌ ProtectedRoute: Role not allowed, redirecting to home');
      return <Navigate to="/" replace />;
    }
  }

  console.log('✅ ProtectedRoute: Access granted');
  return <>{children}</>;
};

// Auth Redirect Component
const AuthRedirect: React.FC = () => {
  const auth = useAuth();
  const { isLoading, isAuthenticated, needsRoleSelection, userRoles, error } = useAuthFlow();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('📍 AuthRedirect useEffect:', {
      isAuthenticated,
      isLoading,
      needsRoleSelection,
      userRoles,
      error
    });

    // Esperar a que termine de cargar
    if (isLoading) {
      console.log('⏳ AuthRedirect: Esperando que termine de cargar...');
      return;
    }

    // No hacer nada si no está autenticado (redirigirá a home)
    if (!isAuthenticated) {
      console.log('🔒 AuthRedirect: No autenticado, redirigiendo a home');
      navigate('/', { replace: true });
      return;
    }

    // Redirigir según el estado
    if (needsRoleSelection) {
      console.log('🎭 AuthRedirect: Redirigiendo a selección de rol');
      navigate('/role-selection', { replace: true });
      return;
    }
    // Si tiene roles, redirigir al dashboard correspondiente
    if (userRoles && userRoles.length > 0) {
      const redirectPath = userRoles.includes('student') ? '/student-dashboard' : '/tutor-dashboard';
      console.log('📊 AuthRedirect: Redirigiendo a:', redirectPath);
      navigate(redirectPath, { replace: true });
      return;
    }

    console.log('🤔 AuthRedirect: Estado inesperado, no redirigiendo');
  }, [isAuthenticated, isLoading, needsRoleSelection, userRoles, navigate]);
  // Mostrar estados de carga o error
  if (auth.isLoading || isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        ⏳ Cargando autenticación...
      </div>
    );
  }
  // Mostrar error si existe
  if (auth.error || error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '20px'
      }}>
        <div>❌ Error de autenticación: {auth.error?.message || error}</div>
        <button onClick={() => auth.signinRedirect()}>
          Intentar nuevamente
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Estado mientras se está redirigiendo
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      gap: '20px'
    }}>
      <div>✅ ¡Autenticación exitosa!</div>
      <div>🚀 Redirigiendo...</div>
    </div>
  );
};

// Role Selection Protection Component
const RoleSelectionProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading, isAuthenticated, needsRoleSelection, userRoles } = useAuthFlow();

  console.log('🎭 RoleSelectionProtectedRoute check:', {
    isAuthenticated,
    isLoading,
    needsRoleSelection,
    userRoles
  });
  // Mientras se carga, mostrar indicador
  if (isLoading) {
    console.log('⏳ RoleSelectionProtectedRoute: Cargando...');
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        ⏳ Verificando estado...
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('🔒 RoleSelectionProtectedRoute: Not authenticated, redirecting to home');
    return <Navigate to="/" replace />;
  }
  // Si no necesita selección de roles, redirigir
  if (!needsRoleSelection) {
    // Si ya tiene rol, redirigir al dashboard apropiado
    console.log('✅ RoleSelectionProtectedRoute: Ya tiene roles, redirigiendo al dashboard');
    const redirectPath = userRoles?.includes('student') ? '/student-dashboard' : '/tutor-dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  console.log('🎯 RoleSelectionProtectedRoute: Mostrando selección de roles');
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthRedirect />} />
          <Route path="/register" element={<Navigate to="/" replace />} />

          <Route
            path="/role-selection"
            element={
              <RoleSelectionProtectedRoute>
                <RoleSelectionPage />
              </RoleSelectionProtectedRoute>
            }
          />

          <Route
            path="/student-dashboard"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor-dashboard"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor/mis-clases-simple"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorMeetingsNowPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/availability"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorAvailabilityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:role/:userId"
            element={
              <ProtectedRoute>
                <ProfileViewPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/book/:tutorId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <BookTutorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor-classes"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorClassesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/edit-profile"
            element={
              <ProtectedRoute>
                <EditProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/call/:sessionId"
            element={<ProtectedRoute allowedRoles={['student', 'tutor']}>
              <CallPage />
            </ProtectedRoute>} />
            <Route
              path="/student-reservations"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentReservationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student-finds-tutors"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentFindsTutorsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payment-success"
              element={<PaymentSuccessPage />}
            />
            <Route
              path="/payment-cancel"
              element={<PaymentCancelPage />}
            />
          

        </Routes>
      </div>
    </Router>
  );
};

export default App;