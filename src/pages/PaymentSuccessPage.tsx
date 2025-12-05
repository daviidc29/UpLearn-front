import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import ApiPaymentService from '../service/Api-payment';
import '../styles/PaymentSuccessPage.css';

const PaymentSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'pending-confirm'>('loading');
  const [message, setMessage] = useState('Procesando tu pago...');
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ tokens?: number; amount?: number } | null>(null);

  // Guarda para evitar que el proceso de confirmación se ejecute más de una vez
  const hasConfirmedRef = useRef(false);

  // Efecto SOLO para confirmar el pago (se ejecuta una vez al montar)
  useEffect(() => {
    const confirmOnce = async () => {
      if (hasConfirmedRef.current) return; // evita dobles llamadas
      hasConfirmedRef.current = true;
      try {
        const sessionId = searchParams.get('session_id');
        console.log('🔍 [PaymentSuccess] session_id from URL:', sessionId);
        if (!sessionId) throw new Error('Falta session_id en la URL');

        setStatus('pending-confirm');
        setMessage('Confirmando pago con el servidor...');

        console.log('📤 [PaymentSuccess] Llamando confirmPayment (una sola vez)...');
        const confirm = await ApiPaymentService.confirmPayment(sessionId);
        console.log('✅ [PaymentSuccess] Pago confirmado:', confirm);
        setSessionInfo({ tokens: confirm.tokens, amount: confirm.amount });

        setStatus('success');
        setMessage('¡Pago confirmado!');
        setTimeout(() => navigate('/student-dashboard'), 3000);
      } catch (error) {
        console.error('❌ [PaymentSuccess] Error procesando el pago:', error);
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Ocurrió un error al procesar tu pago. Por favor, contacta a soporte.'
        );
      }
    };
    confirmOnce();
  }, [searchParams, navigate]);

  // Efecto separado para refrescar balance cuando ya hay confirmación y token disponible
  useEffect(() => {
    const refreshBalance = async () => {
      if (status !== 'success') return;
      if (newBalance !== null) return; // ya refrescado
      try {
        const cognitoToken = (auth.user as any)?.id_token ?? auth.user?.access_token;
        if (!cognitoToken) return;
        console.log('🔄 [PaymentSuccess] Refrescando balance después de confirmación...');
        const balanceData = await ApiPaymentService.getStudentBalance(cognitoToken);
        setNewBalance(balanceData.tokenBalance);
        console.log('💰 [PaymentSuccess] Nuevo balance:', balanceData.tokenBalance);
      } catch (e) {
        console.warn('⚠️ [PaymentSuccess] No se pudo refrescar el balance:', e);
      }
    };
    refreshBalance();
  }, [status, auth.user, newBalance]);

  if (auth.isLoading) {
    return (
      <div className="payment-page">
        <div className="payment-card">
          <div className="loader"></div>
          <p>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page">
      <div className="payment-card">
        {status === 'loading' && (
          <>
            <div className="loader"></div>
            <h1>Procesando tu pago</h1>
            <p>{message}</p>
          </>
        )}

        {status === 'pending-confirm' && (
          <>
            <div className="loader"></div>
            <h1>Confirmando pago</h1>
            <p>{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="success-icon">✓</div>
            <h1>¡Pago exitoso!</h1>
            <p>{message}</p>
            {newBalance !== null && (
              <div className="balance-display">
                <p className="balance-label">Nuevo balance:</p>
                <p className="balance-amount">{newBalance} tokens</p>
              </div>
            )}
            {sessionInfo && (
              <p style={{ color: '#6b7280' }}>Tokens acreditados: {sessionInfo.tokens ?? 'N/D'} | Monto: {sessionInfo.amount ?? 'N/D'}</p>
            )}
            <p className="redirect-message">Serás redirigido al dashboard en unos segundos...</p>
            <button 
              className="btn-primary"
              onClick={() => navigate('/student-dashboard')}
              type="button"
            >
              Ir al Dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon">✕</div>
            <h1>Error al procesar el pago</h1>
            <p className="error-text">{message}</p>
            <div className="button-group">
              <button 
                className="btn-primary"
                onClick={() => navigate('/student-dashboard')}
                type="button"
              >
                Volver al Dashboard
              </button>
              <button 
                className="btn-secondary"
                onClick={() => window.location.reload()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
