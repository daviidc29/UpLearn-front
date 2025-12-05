import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/ProfileIncompleteNotification.css';

interface ProfileIncompleteNotificationProps {
  missingFields: string[];
  currentRole: string;
  onDismiss?: () => void;
}

const ProfileIncompleteNotification: React.FC<ProfileIncompleteNotificationProps> = ({
  missingFields,
  currentRole,
  onDismiss
}) => {
  const navigate = useNavigate();

  const handleCompleteProfile = () => {
    navigate('/edit-profile', { state: { currentRole } });
  };

  return (
    <section className="profile-incomplete-notification" aria-label="Aviso de perfil incompleto" aria-live="polite">
      {onDismiss && (
        <button
          type="button"
          className="btn-dismiss btn-dismiss-floating"
          aria-label="Cerrar aviso de perfil incompleto"
          onClick={onDismiss}
        >
          ×
        </button>
      )}

      <div className="notification-content">
        <div className="notification-text">
          <h3>Perfil Incompleto</h3>
          <p>Por favor completa tu perfil para aprovechar todas las funcionalidades.</p>
        </div>

        <div className="notification-actions">
          <button
            className="btn-complete-profile"
            onClick={handleCompleteProfile}
            type="button"
          >
            Completar Perfil
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProfileIncompleteNotification;
