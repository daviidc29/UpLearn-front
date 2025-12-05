import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PaymentSuccessPage.css';

const PaymentCancelPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="payment-page">
      <div className="payment-card">
        <div className="error-icon">⚠️</div>
        <h1>Pago Cancelado</h1>
        <p>Has cancelado el proceso de pago. No se realizó ningún cargo.</p>
        <p className="error-text">Si experimentaste algún problema, por favor intenta nuevamente o contacta a soporte.</p>
        
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
            onClick={() => window.history.back()}
            type="button"
          >
            Intentar Nuevamente
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancelPage;
