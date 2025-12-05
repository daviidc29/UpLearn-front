import { useState, useEffect } from 'react';
import { useAuth } from "react-oidc-context";
import { useLocation } from 'react-router-dom';
import ApiUserService from '../service/Api-user';

interface ProfileStatus {
  complete?: boolean;      // El backend usa 'complete'
  isComplete?: boolean;    // Por si acaso el backend cambia
  missingFields: string[] | null;
  currentRole: string;
}

/**
 * Hook personalizado para verificar el estado de completitud del perfil
 * Verifica automáticamente cuando el usuario se autentica
 */
export const useProfileStatus = () => {
  const auth = useAuth();
  const location = useLocation(); // Para detectar cambios de ruta
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkProfileStatus = async () => {
      // Solo verificar si está autenticado y tiene token
      if (!auth.isAuthenticated || !auth.user?.id_token) {
        console.log('🔍 useProfileStatus: No autenticado o sin token');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Detectar el rol según la ruta actual
        let currentRole: string | undefined = undefined;
        if (location.pathname.includes('/student-dashboard')) {
          currentRole = 'STUDENT';
        } else if (location.pathname.includes('/tutor-dashboard')) {
          currentRole = 'TUTOR';
        }
        
        console.log('🔍 useProfileStatus: Verificando estado del perfil...', 
                    currentRole ? `para rol: ${currentRole}` : 'sin rol específico');
        const status = await ApiUserService.getProfileStatus(auth.user.id_token, currentRole);
        console.log('✅ useProfileStatus: Estado recibido:', status);
        setProfileStatus(status);
        
      } catch (err) {
        console.error('❌ useProfileStatus: Error verificando estado del perfil:', err);
        setError(err instanceof Error ? err.message : 'Error verificando el perfil');
      } finally {
        setIsLoading(false);
      }
    };

    checkProfileStatus();
  }, [auth.isAuthenticated, auth.user?.id_token, location.pathname]); // Agregar location.pathname para re-verificar al cambiar de ruta

  const result = {
    profileStatus,
    isLoading,
    error,
    isProfileComplete: (profileStatus?.complete ?? profileStatus?.isComplete) ?? true, // Usar 'complete' o 'isComplete'
    missingFields: profileStatus?.missingFields ?? null,
  };

  console.log('📊 useProfileStatus: Retornando resultado:', result);

  return result;
};
