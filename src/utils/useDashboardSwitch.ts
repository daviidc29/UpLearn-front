import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import ApiUserService from '../service/Api-user';

interface UserRolesResponse {
  roles: string[];
  [key: string]: any;
}

export const useDashboardSwitch = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const switchToDashboard = async (targetRole: 'student' | 'tutor') => {
    if (!auth.user?.id_token) {
      setError('No hay token de autenticación disponible');
      return false;
    }

    setIsLoading(true);
    setError('');

    try {
      // Verificar que el usuario tiene el rol solicitado
      const rolesData = await ApiUserService.getMyRoles(auth.user.id_token) as UserRolesResponse;

      const userRoles = rolesData.roles || [];
      
      if (!userRoles.includes(targetRole)) {
        setError(`No tienes permisos para acceder como ${targetRole === 'student' ? 'estudiante' : 'tutor'}`);
        return false;
      }

      // Navegar al dashboard correspondiente
      const targetPath = targetRole === 'student' ? '/student-dashboard' : '/tutor-dashboard';
      
      navigate(targetPath);
      return true;

    } catch (error) {
      console.error('Error cambiando dashboard:', error);
      setError(error instanceof Error ? error.message : 'Error al cambiar de dashboard');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const canSwitchTo = async (targetRole: 'student' | 'tutor'): Promise<boolean> => {
    if (!auth.user?.id_token) return false;

    try {
      const rolesData = await ApiUserService.getMyRoles(auth.user.id_token) as UserRolesResponse;
      const userRoles = rolesData.roles || [];
      return userRoles.includes(targetRole);
    } catch (error) {
      console.error('Error verificando roles:', error);
      return false;
    }
  };

  return {
    switchToDashboard,
    canSwitchTo,
    isLoading,
    error
  };
};