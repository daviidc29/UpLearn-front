import { useState, useEffect } from 'react';
import { useAuth } from "react-oidc-context";
import ApiUserService from '../service/Api-user';

/**
 * Hook personalizado para manejar la integración con Cognito
 * Automaticamente envía el token al backend cuando el usuario se autentica
 */
export const useCognitoIntegration = () => {
  const auth = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isProcessed, setIsProcessed] = useState(false);

  useEffect(() => {
    const processCognitoUser = async () => {
      // Solo procesar si está autenticado, tiene token y no ha sido procesado aún
      if (auth.isAuthenticated && 
          auth.user?.id_token && 
          !isProcessed && 
          !isProcessing) {
        
        setIsProcessing(true);
        setProcessingError(null);

        try {
          const backendUser = await ApiUserService.processCognitoUser(auth.user.id_token);
          
          setIsProcessed(true);

        } catch (error) {
          console.error('Error procesando usuario de Cognito:', error);
          setProcessingError(error instanceof Error ? error.message : 'Error desconocido');
          
          // Mostrar advertencia al usuario pero no bloquear la aplicación
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          console.warn(`No se pudo sincronizar con el backend: ${errorMessage}`);
        } finally {
          setIsProcessing(false);
        }
      }
    };

    processCognitoUser();
  }, [auth.isAuthenticated, auth.user?.id_token, isProcessed, isProcessing]);

  // Reset cuando el usuario se desautentica
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setIsProcessed(false);
      setProcessingError(null);
      setIsProcessing(false);
    }
  }, [auth.isAuthenticated]);

  return {
    isProcessing,
    processingError,
    isProcessed,
    hasError: !!processingError
  };
};