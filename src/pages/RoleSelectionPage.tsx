import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import '../styles/RoleSelectionPage.css';
import ApiUserService from '../service/Api-user';
import { clearAuthState } from '../utils/useAuthFlow';

const RoleSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleRoleSelection = async () => {
    if (selectedRoles.length === 0) {
      setError('Por favor selecciona al menos un rol');
      return;
    }

    if (!auth.user?.id_token) {
      setError('Error de autenticación. Por favor inicia sesión nuevamente.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Enviar los roles seleccionados al backend junto con el token de Cognito
      await ApiUserService.saveUserRole(auth.user.id_token, selectedRoles);

      // Limpiar estado global para forzar recarga de useAuthFlow
      clearAuthState();

      // Redirigir directamente al dashboard apropiado
      const redirectPath = selectedRoles.includes('student') ? '/student-dashboard' : '/tutor-dashboard';
      navigate(redirectPath, { replace: true });

    } catch (error) {
      console.error('Error guardando roles:', error);
      setError('Error al guardar los roles. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRole = (roleValue: string) => {
    setSelectedRoles(prev => {
      if (prev.includes(roleValue)) {
        return prev.filter(role => role !== roleValue);
      } else {
        return [...prev, roleValue];
      }
    });
  };

  const roles = [
    {
      value: 'student',
      title: 'Estudiante',
      description: 'Busca tutores y reserva sesiones de aprendizaje',
      icon: '📚'
    },
    {
      value: 'tutor',
      title: 'Tutor',
      description: 'Ofrece tus conocimientos y enseña a otros estudiantes',
      icon: '👨‍🏫'
    }
  ];

  if (isLoading) {
    return (
      <div className="role-selection-container">
        <div className="role-selection-content">
          <div className="loading-state">
            <h2>Guardando tu selección...</h2>
            <div className="loading-spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="role-selection-container">
      <div className="role-selection-content">
        <div className="role-selection-header">
          <h1>¡Bienvenido a UpLearn!</h1>
          <p>Para continuar, selecciona tu(s) rol(es) en la plataforma:</p>
          <p className="multiple-selection-note">
            Puedes seleccionar ambos roles si planeas ser estudiante y tutor
          </p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="roles-grid">
          {roles.map((role) => (
            <label
              key={role.value}
              className={`role-card ${selectedRoles.includes(role.value) ? 'selected' : ''}`}
              htmlFor={role.value}
              onTouchStart={() => toggleRole(role.value)}
            >
              <div className="role-icon">{role.icon}</div>
              <h3 className="role-title">{role.title}</h3>
              <p className="role-description">{role.description}</p>
              <div className="role-checkbox">
                <input
                  type="checkbox"
                  id={role.value}
                  name="roles"
                  value={role.value}
                  checked={selectedRoles.includes(role.value)}
                  onChange={() => toggleRole(role.value)}
                />
                <span>Seleccionar</span>
              </div>
            </label>
          ))}
        </div>

        <div className="selected-roles-summary">
          {selectedRoles.length > 0 && (
            <div className="selection-summary">
              <h4>Roles seleccionados:</h4>
              <div className="selected-roles-list">
                {selectedRoles.map(role => (
                  <span key={role} className="selected-role-badge">
                    {role === 'student' ? '📚 Estudiante' : '👨‍🏫 Tutor'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleRoleSelection}
            disabled={selectedRoles.length === 0 || isLoading}
          >
            Continuar
          </button>
        </div>

        <div className="role-selection-footer">
          <p className="note">
            Nota: Podrás cambiar tus roles más tarde desde tu perfil si lo necesitas.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoleSelectionPage;