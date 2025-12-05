import { useState } from 'react';
import { useAuth } from "react-oidc-context";
import ApiUserService from '../service/Api-user';
import { clearAuthState } from './useAuthFlow';

interface UserRolesResponse {
  roles: string[];
  user: any;
  [key: string]: any;
}

export const useAddRole = () => {
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const addRole = async (newRole: 'student' | 'tutor'): Promise<boolean> => {
    if (!auth.user?.id_token) {
      setError('No hay token de autenticación disponible');
      return false;
    }

    if (!auth.user?.profile?.sub) {
      setError('No se pudo obtener el ID del usuario');
      return false;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Primero verificar que no tenga ya ese rol
      const currentRolesData = await ApiUserService.getMyRoles(auth.user.id_token) as UserRolesResponse;
      const currentRoles = currentRolesData.roles || [];
      
      if (currentRoles.includes(newRole)) {
        setError(`Ya tienes el rol de ${newRole === 'student' ? 'estudiante' : 'tutor'}`);
        return false;
      }

      // Añadir el nuevo rol
      const result = await ApiUserService.addRoleToUser(
        auth.user.id_token,
        auth.user.profile.sub,
        newRole
      );
      
      const roleText = newRole === 'student' ? 'estudiante' : 'tutor';
      setSuccess(`¡Ahora también eres ${roleText}! Puedes cambiar entre dashboards.`);
      
      // Limpiar estado global para forzar recarga de roles
      clearAuthState();
      
      return true;

    } catch (error) {
      console.error('Error añadiendo rol:', error);
      setError(error instanceof Error ? error.message : 'Error al añadir el rol');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const canAddRole = async (targetRole: 'student' | 'tutor'): Promise<boolean> => {
    if (!auth.user?.id_token) return false;

    try {
      const rolesData = await ApiUserService.getMyRoles(auth.user.id_token) as UserRolesResponse;
      const userRoles = rolesData.roles || [];
      return !userRoles.includes(targetRole);
    } catch (error) {
      console.error('Error verificando roles:', error);
      return false;
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  return {
    addRole,
    canAddRole,
    isLoading,
    error,
    success,
    clearMessages
  };
};