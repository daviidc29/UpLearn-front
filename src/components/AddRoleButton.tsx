import React, { useState, useEffect } from 'react';
import { useAddRole } from '../utils/useAddRole';

interface AddRoleButtonProps {
  currentRole: 'student' | 'tutor';
  className?: string;
  asMenuItem?: boolean; // Nueva prop para renderizar como item de menú
}

const AddRoleButton: React.FC<AddRoleButtonProps> = ({
  currentRole,
  className = '',
  asMenuItem = false
}) => {
  const { addRole, canAddRole, isLoading, error, success, clearMessages } = useAddRole();
  const [canAdd, setCanAdd] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  const targetRole = currentRole === 'student' ? 'tutor' : 'student';
  const targetRoleText = targetRole === 'student' ? 'Estudiante' : 'Tutor';
  const targetIcon = targetRole === 'student' ? '📚' : '👨‍🏫';

  useEffect(() => {
    const checkPermissions = async () => {
      const canAddResult = await canAddRole(targetRole);
      setCanAdd(canAddResult);
    };

    checkPermissions();
  }, [targetRole, canAddRole]);

  const handleAddRole = async () => {
    const success = await addRole(targetRole);
    if (success || error) {
      setShowMessage(true);
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        setShowMessage(false);
        clearMessages();
      }, 5000);
      
      // Si fue exitoso, recargar permisos inmediatamente
      if (success) {
        const canAddResult = await canAddRole(targetRole);
        setCanAdd(canAddResult);
      }
    }
  };

  // No mostrar el botón si no puede añadir el rol
  if (!canAdd) {
    return null;
  }

  // Renderizar como item de menú desplegable
  if (asMenuItem) {
    return (
      <button
        className={`dropdown-item ${className}`}
        onClick={handleAddRole}
        disabled={isLoading}
      >
        <span>{targetIcon}</span> {isLoading ? 'Añadiendo...' : `Ser ${targetRoleText}`}
      </button>
    );
  }

  // Renderizar como botón normal (versión anterior)
  return (
    <div className="add-role-container">
      <button
        className={`add-role-btn ${className}`}
        onClick={handleAddRole}
        disabled={isLoading}
        title={`Convertirte también en ${targetRoleText}`}
      >
        <span className="add-role-icon">{targetIcon}</span>
        <span className="add-role-text">
          {isLoading ? 'Añadiendo...' : `Ser ${targetRoleText}`}
        </span>
      </button>

      {showMessage && (success || error) && (
        <div className={`add-role-message ${success ? 'success' : 'error'}`}>
          <div className="message-content">
            <span className="message-icon">{success ? '✅' : '❌'}</span>
            <span className="message-text">{success || error}</span>
            <button
              className="message-close"
              onClick={() => {
                setShowMessage(false);
                clearMessages();
              }}
              title="Cerrar mensaje"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddRoleButton;