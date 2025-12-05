import React, { useState, useEffect } from 'react';
import { useDashboardSwitch } from '../utils/useDashboardSwitch';

interface DashboardSwitchButtonProps {
  currentRole: 'student' | 'tutor';
  className?: string;
  asMenuItem?: boolean; // Nueva prop para renderizar como item de menú
}
const DashboardSwitchButton: React.FC<DashboardSwitchButtonProps> = ({
  currentRole,
  className = '',
  asMenuItem = false
}) => {
  const { switchToDashboard, canSwitchTo, isLoading, error } = useDashboardSwitch();
  const [canSwitch, setCanSwitch] = useState(false);

  const targetRole = currentRole === 'student' ? 'tutor' : 'student';
  const targetRoleText = targetRole === 'student' ? 'Estudiante' : 'Tutor';
  const targetIcon = targetRole === 'student' ? '📚' : '👨‍🏫';

  useEffect(() => {
    const checkPermissions = async () => {
      const canSwitchResult = await canSwitchTo(targetRole);
      setCanSwitch(canSwitchResult);
    };

    checkPermissions();
    
    // Recargar cada 2 segundos para detectar cambios en los roles
    const interval = setInterval(checkPermissions, 2000);
    
    return () => clearInterval(interval);
  }, [targetRole, canSwitchTo]);

  const handleSwitch = async () => {
    await switchToDashboard(targetRole);
  };

  // No mostrar el botón si no puede cambiar de rol
  if (!canSwitch) {
    return null;
  }

  // Renderizar como item de menú desplegable
  if (asMenuItem) {
    return (
      <button
        className={`dropdown-item ${className}`}
        onClick={handleSwitch}
        disabled={isLoading}
      >
        <span>{targetIcon}</span> {isLoading ? 'Cambiando...' : `Ir a ${targetRoleText}`}
      </button>
    );
  }

  // Renderizar como botón normal (versión anterior)
  return (
    <div className="dashboard-switch-container">
      <button
        className={`dashboard-switch-btn ${className}`}
        onClick={handleSwitch}
        disabled={isLoading}
        title={`Cambiar a dashboard de ${targetRoleText}`}
      >
        <span className="switch-icon">{targetIcon}</span>
        <span className="switch-text">
          {isLoading ? 'Cambiando...' : `Ir a ${targetRoleText}`}
        </span>
      </button>

      {error && (
        <div className="switch-error" style={{
          color: 'red',
          fontSize: '12px',
          marginTop: '4px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default DashboardSwitchButton;