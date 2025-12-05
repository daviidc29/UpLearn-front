import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import '../styles/HomePage.css';
import { useAuthFlow } from '../utils/useAuthFlow';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();

  const handleLogin = () => {
    // Redirigir directamente a Cognito para login
    auth.signinRedirect();
  };

  const handleRegister = () => {
    // Redirigir directamente a Cognito para registro
    auth.signinRedirect({
      extraQueryParams: {
        signup: 'true'
      }
    });
  };

  const handleLogout = async () => {
    // Cerrar sesión local primero
    auth.removeUser();
    
    // Luego redirigir a Cognito para cerrar sesión
    const clientId = "342s18a96gl2pbaroorqh316l8";
    const logoutUri = "http://localhost:3000";
    const cognitoDomain = "https://us-east-18mvprkbvu.auth.us-east-1.amazoncognito.com";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const goToDashboard = () => {
    if (isAuthenticated && userRoles && userRoles.length > 0) {
      // Priorizar estudiante si tiene ambos roles
      const redirectPath = userRoles.includes('student') ? '/student-dashboard' : '/tutor-dashboard';
      navigate(redirectPath);
    } else {
      navigate('/login');
    }
  };

  // Mostrar estado de carga
  if (auth.isLoading) {
    return (
      <div className="home-container">
        <div className="content">
          <h1 className="title">Cargando...</h1>
          <p className="subtitle">Verificando estado de autenticación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="content">
        <h1 className="title">Bienvenido a UpLearn</h1>
        <p className="subtitle">Tu plataforma de aprendizaje online</p>
        
        {auth.isAuthenticated ? (
          // usuario está autentificado
          <div className="authenticated-section">
            <div className="user-info">
              <p className="welcome-message">
                ¡Hola, {auth.user?.profile?.email || 'Usuario'}! 👋
              </p>
              <p className="auth-status">
                Estado: <strong>Autenticado con AWS Cognito</strong>
              </p>
            </div>
            
            <div className="buttons-container">
              <button 
                className="btn btn-dashboard" 
                onClick={goToDashboard}
              >
                Ir al Dashboard
              </button>
              
              <button 
                className="btn btn-logout" 
                onClick={handleLogout}
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        ) : (
          // usuario no está autenticado
          <div className="buttons-container">
            <button 
              className="btn btn-login" 
              onClick={handleLogin}
            >
              Iniciar Sesión
            </button>
            
            <button 
              className="btn btn-register" 
              onClick={handleRegister}
            >
              Registrarse
            </button>
          </div>
        )}

        {/* Authentication error */}
        {auth.error && (
          <div className="error-info">
            <h3>Error de Autenticación</h3>
            <p>{auth.error.message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;