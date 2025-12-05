import { useEffect, useState } from 'react';
import { useAuth } from "react-oidc-context";
import { useNavigate } from 'react-router-dom';
import ApiUserService from '../service/Api-user';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  needsRoleSelection: boolean;
  userRoles: string[] | null;
  error: string | null;
}

// Estado global para evitar múltiples peticiones simultáneas
let globalAuthState: AuthState | null = null;
let isProcessingGlobal = false;
let processPromise: Promise<AuthState> | null = null;
let lastTokenProcessed: string | null = null;

// Función para limpiar el estado global (útil después de cambios en roles)
export const clearAuthState = () => {
  globalAuthState = null;
  isProcessingGlobal = false;
  processPromise = null;
  lastTokenProcessed = null;
};

export const useAuthFlow = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>(() => {
    // Inicializar con el estado global si existe y es válido
    if (globalAuthState && globalAuthState.isAuthenticated && !globalAuthState.isLoading) {
      return globalAuthState;
    }
    
    return {
      isLoading: true,
      isAuthenticated: false,
      needsRoleSelection: false,
      userRoles: null,
      error: null
    };
  });

  useEffect(() => {
    const handleAuthFlow = async () => {
      const currentToken = auth.user?.id_token;
      
      // Si no está autenticado con Cognito, limpiar estado
      if (!auth.isAuthenticated || !currentToken) {
        const newState = {
          isLoading: false,
          isAuthenticated: false,
          needsRoleSelection: false,
          userRoles: null,
          error: null
        };
        setAuthState(newState);
        globalAuthState = newState;
        lastTokenProcessed = null;
        return;
      }

      // Si ya tenemos un estado global válido para este mismo token, usarlo
      if (globalAuthState && 
          globalAuthState.isAuthenticated && 
          !globalAuthState.isLoading && 
          lastTokenProcessed === currentToken) {
        setAuthState(globalAuthState);
        return;
      }

      // Si el token cambió, limpiar estado anterior
      if (lastTokenProcessed && lastTokenProcessed !== currentToken) {
        clearAuthState();
      }

      // Si ya hay un proceso en curso para este token, esperar a que termine
      if (isProcessingGlobal && processPromise && lastTokenProcessed === currentToken) {
        try {
          const result = await processPromise;
          setAuthState(result);
          return;
        } catch (error) {
          console.error('Error esperando proceso:', error);
        }
      }

      // Marcar como procesando y crear promesa
      isProcessingGlobal = true;
      lastTokenProcessed = currentToken;
      processPromise = processAuthFlow();

      try {
        const result = await processPromise;
        setAuthState(result);
        globalAuthState = result;
      } catch (error) {
        console.error('Error en el flujo de autenticación:', error);
        const errorState = {
          isLoading: false,
          isAuthenticated: false,
          needsRoleSelection: false,
          userRoles: null,
          error: error instanceof Error ? error.message : 'Error de autenticación'
        };
        setAuthState(errorState);
        globalAuthState = errorState;
      } finally {
        isProcessingGlobal = false;
        processPromise = null;
      }
    };

    const processAuthFlow = async (): Promise<AuthState> => {
      try {
        // Procesar usuario con Cognito
        const token = auth.user?.id_token;
        if (!token) {
          throw new Error('Token de Cognito no disponible');
        }
        
        const result = await ApiUserService.processCognitoUser(token);
        
        // Si es un usuario nuevo (sin roles), necesita seleccionar roles
        // Verificar diferentes casos de roles vacíos
        const userRoles = result.user?.roles;
        const hasNoRoles = !userRoles || 
                          userRoles.length === 0 || 
                          (Array.isArray(userRoles) && userRoles.every((role: string) => !role || role.trim() === '')) ||
                          userRoles === null ||
                          userRoles === undefined;
        
        // FORZAR selección de roles si es usuario nuevo, independientemente de los roles devueltos
        if (result.isNewUser || hasNoRoles) {
          return {
            isLoading: false,
            isAuthenticated: true,
            needsRoleSelection: true,
            userRoles: null,
            error: null
          };
        }

        // Usuario existente con roles, preparar estado (sin redirigir aquí)
        const newState = {
          isLoading: false,
          isAuthenticated: true,
          needsRoleSelection: false,
          userRoles: result.user.roles,
          error: null
        };

        // NO redirigir desde aquí - dejar que AuthRedirect maneje la redirección

        return newState;

      } catch (error) {
        console.error('Error procesando flujo de autenticación:', error);
        throw error;
      }
    };

    handleAuthFlow();
  }, [auth.isAuthenticated, auth.user?.id_token]);

  return {
    ...authState,
    auth
  };
};