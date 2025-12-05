import React, { useState } from 'react';
import ApiPaymentService, { type StripeCheckoutRequest, type StripeResponse, extractStripeCheckoutUrl } from '../service/Api-payment';
import '../styles/BuyTokensModal.css';

interface BuyTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  cognitoToken?: string;
}

const PREDEFINED_PACKAGES = [
  { tokens: 10, price: 20000, popular: false },
  { tokens: 25, price: 50000, popular: true },
  { tokens: 50, price: 100000, popular: false },
  { tokens: 100, price: 200000, popular: false },
];

const BuyTokensModal: React.FC<BuyTokensModalProps> = ({ 
  isOpen, 
  onClose, 
  currentBalance,
  cognitoToken 
}) => {
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const MIN_TOTAL_COP = 2000; // mínimo requerido por backend/Stripe
  const PRICE_PER_TOKEN = 2000; 

  const handlePurchase = async (quantity: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const total = quantity * PRICE_PER_TOKEN;
      if (total < MIN_TOTAL_COP) {
        const faltan = MIN_TOTAL_COP - total;
        setError(`El total debe ser ≥ ${MIN_TOTAL_COP} COP. Faltan ${faltan} COP.`);
        setIsLoading(false);
        return;
      }

      const request: StripeCheckoutRequest = {
        quantity,
        name: 'Token', // singular
        currency: 'cop'
      };

      const response: StripeResponse = await ApiPaymentService.createCheckoutSession(request, cognitoToken);
      console.log('[BuyTokensModal] checkout response:', response);
      const redirectUrl = extractStripeCheckoutUrl(response);
      if (response.status === 'success' && redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      if (response.status === 'success' && !redirectUrl) {
        throw new Error(`Respuesta exitosa sin URL. Claves recibidas: ${Object.keys(response).join(', ')}`);
      }
      throw new Error(response.message || 'Error desconocido del backend de pagos');
    } catch (err) {
      console.error('Error al crear sesión de pago:', err);
      setError(err instanceof Error ? err.message : 'Error al procesar la compra');
      setIsLoading(false);
    }
  };

  const handlePackageSelect = (tokens: number) => {
    setSelectedPackage(tokens);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCustomAmount(value);
      setSelectedPackage(null);
      setError(null);
    }
  };

  const handleBuyClick = () => {
    const quantity = selectedPackage || parseInt(customAmount, 10);
    
    if (!quantity || quantity <= 0) {
      setError('Por favor selecciona un paquete o ingresa una cantidad válida');
      return;
    }

    if (quantity > 1000) {
      setError('La cantidad máxima es 1000 tokens');
      return;
    }

    handlePurchase(quantity);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const selectedQuantity = selectedPackage || parseInt(customAmount, 10) || 0;
  const totalPrice = selectedQuantity * PRICE_PER_TOKEN;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <img 
              src="/coin-icon.png" 
              alt="Moneda" 
              className="coin-icon"
            />
            Comprar Tokens
          </h2>
          <button className="close-button" onClick={onClose} type="button">✕</button>
        </div>

        <div className="modal-body">
          <div className="current-balance">
            <span className="balance-label">Balance actual:</span>
            <span className="balance-amount">{currentBalance} tokens</span>
          </div>

          <div className="packages-section">
            <h3>Paquetes de tokens</h3>
            <p className="conversion-rate">1 Token = {formatCurrency(PRICE_PER_TOKEN)} (mínimo total {formatCurrency(MIN_TOTAL_COP)})</p>

            <div className="packages-grid">
              {PREDEFINED_PACKAGES.map((pkg) => (
                <button
                  key={pkg.tokens}
                  className={`package-card ${selectedPackage === pkg.tokens ? 'selected' : ''} ${pkg.popular ? 'popular' : ''}`}
                  onClick={() => handlePackageSelect(pkg.tokens)}
                  disabled={isLoading}
                  type="button"
                >
                  {pkg.popular && <span className="popular-badge">Más popular</span>}
                  <div className="package-tokens">{pkg.tokens} tokens</div>
                  <div className="package-price">{formatCurrency(pkg.price)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="custom-amount-section">
            <h3>Cantidad personalizada</h3>
            <div className="custom-input-wrapper">
              <input
                type="text"
                className="custom-input"
                placeholder="Ingresa cantidad de tokens"
                value={customAmount}
                onChange={handleCustomAmountChange}
                disabled={isLoading}
              />
              <span className="input-suffix">tokens</span>
            </div>
            {customAmount && parseInt(customAmount, 10) > 0 && (
              <p className="custom-price">
                Total: {formatCurrency(parseInt(customAmount, 10) * PRICE_PER_TOKEN)}
              </p>
            )}
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="purchase-summary">
            {selectedQuantity > 0 && (
              <>
                <div className="summary-row">
                  <span>Tokens a comprar:</span>
                  <strong>{selectedQuantity}</strong>
                </div>
                <div className="summary-row total">
                  <span>Total a pagar:</span>
                  <strong>{formatCurrency(totalPrice)}</strong>
                </div>
                {totalPrice < MIN_TOTAL_COP && (
                  <div className="summary-row" style={{ color: '#dc2626' }}>
                    <span>Falta para mínimo:</span>
                    <strong>{formatCurrency(MIN_TOTAL_COP - totalPrice)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="btn-secondary" 
            onClick={onClose}
            disabled={isLoading}
            type="button"
          >
            Cancelar
          </button>
          <button 
            className="btn-primary"
            onClick={handleBuyClick}
            disabled={isLoading || selectedQuantity <= 0}
            type="button"
          >
            {isLoading ? '⏳ Procesando...' : '🔒 Pagar con Stripe'}
          </button>
        </div>

        <div className="payment-info">
          <p>🔒 Pago seguro procesado por Stripe</p>
          <p>Los tokens se agregarán a tu cuenta después del pago exitoso</p>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>Cantidad seleccionada: {selectedQuantity}</p>
        </div>
      </div>
    </div>
  );
};

export default BuyTokensModal;
