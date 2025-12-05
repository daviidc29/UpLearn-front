const PAYMENT_BASE_URL = 'http://localhost:8081/api'; 

export interface StripeCheckoutRequest {
  quantity: number;      // obligatorio
  name?: string;         // ahora usamos 'Token' por defecto (singular)
  currency?: string;     // 'cop'
}

// Backend puede devolver 'url' o 'sessionUrl'
export interface StripeResponse {
  status: string;
  message: string;
  sessionId: string;
  url?: string;
  sessionUrl?: string;
  session_url?: string;
  checkoutUrl?: string;
  checkout_url?: string;
  redirectUrl?: string;
  redirect_url?: string;
  [key: string]: any; // tolerar campos adicionales
}

/**
 * Intenta extraer la URL de Stripe de la respuesta usando múltiples nombres posibles.
 * Si no encuentra directamente, busca cualquier string que contenga 'stripe.com'.
 */
export function extractStripeCheckoutUrl(data: StripeResponse): string | null {
  const direct = [
    data.url,
    data.sessionUrl,
    data.session_url,
    data.checkoutUrl,
    data.checkout_url,
    data.redirectUrl,
    data.redirect_url,
  ].filter(Boolean) as string[];
  if (direct.length > 0) return direct[0];
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.startsWith('http') && v.includes('stripe.com')) {
      return v;
    }
  }
  return null;
}

export interface WalletBalance {
  userId: string;
  tokenBalance: number;
  warning?: string;
}

export interface PaymentSuccessPayload {
  sessionId: string;
  userId: string;
  tokens: number;
  amount: number;
}

class ApiPaymentService {
  /**
   * Obtiene el token de Cognito del localStorage
   */
  private static getCognitoToken(): string | null {
    return localStorage.getItem('uplearn_cognito_token');
  }

  /**
   * Verifica si el estudiante autenticado tiene suficientes tokens para una acción que requiere `requiredTokens`.
   * Intenta primero endpoint estilo role-first: /wallet/student/check/{tokens}
   * Si falla (404), intenta variante /wallet/check/student/{tokens} por si el backend está configurado distinto.
   */
  static async checkStudentTokens(requiredTokens: number, cognitoToken?: string): Promise<{
    hasEnoughTokens: boolean;
    requiredTokens: number;
    currentBalance: number;
    role?: string;
    [k: string]: any;
  }> {
    if (requiredTokens <= 0) {
      return {
        hasEnoughTokens: true,
        requiredTokens,
        currentBalance: Infinity,
        role: 'STUDENT'
      };
    }
    const token = cognitoToken || this.getCognitoToken();
    if (!token) throw new Error('No hay token de autenticación');

    const attempt = async (url: string) => {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error(String(resp.status));
      return resp.json();
    };

    const base1 = `${PAYMENT_BASE_URL}/wallet/student/check/${requiredTokens}`;
    const base2 = `${PAYMENT_BASE_URL}/wallet/check/student/${requiredTokens}`;
    try {
      return await attempt(base1);
    } catch (e: any) {
      // Sólo reintentar si es 404 o 500 genérico
      if (e?.message === '404') {
        try { return await attempt(base2); } catch (e2) { throw new Error('Error verificando tokens del estudiante'); }
      }
      if (e?.message === '500') {
        try { return await attempt(base2); } catch (e2) { throw new Error('Error verificando tokens del estudiante'); }
      }
      throw new Error('Error verificando tokens del estudiante');
    }
  }

  /**
   * Crea una sesión de checkout en Stripe para comprar tokens
   * @param request - Datos de la compra (cantidad de tokens)
   * @param cognitoToken - Token de autenticación de Cognito
   * @returns Promise con la respuesta de Stripe incluyendo la URL de pago
   */
  static async createCheckoutSession(
    request: StripeCheckoutRequest,
    cognitoToken?: string
  ): Promise<StripeResponse> {
    const token = cognitoToken || this.getCognitoToken();
    
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          quantity: request.quantity,
          name: request.name || 'Token', // Ajuste singular
          currency: request.currency || 'cop'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data: StripeResponse = await response.json();
      const checkoutUrl = extractStripeCheckoutUrl(data);
      console.log('[ApiPayment] createCheckoutSession raw response:', data);
      console.log('[ApiPayment] extracted checkoutUrl:', checkoutUrl);
      if (data.status === 'success' && checkoutUrl) {
        // Inyectar url normalizada para que el caller la use
        return { ...data, url: checkoutUrl };
      }
      return data;
    } catch (error) {
      console.error('Error creando sesión de checkout:', error);
      throw error;
    }
  }

  /**
   * Obtiene el balance de tokens del ESTUDIANTE autenticado
   * @param cognitoToken - Token de autenticación de Cognito
   * @returns Promise con el balance de tokens
   */
  static async getStudentBalance(cognitoToken?: string): Promise<WalletBalance> {
    const token = cognitoToken || this.getCognitoToken();
    
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/wallet/balance/student`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data: WalletBalance = await response.json();
      return data;
    } catch (error) {
      console.error('Error obteniendo balance de estudiante:', error);
      throw error;
    }
  }

  /**
   * Obtiene el balance de tokens del TUTOR autenticado
   * @param cognitoToken - Token de autenticación de Cognito
   * @returns Promise con el balance de tokens
   */
  static async getTutorBalance(cognitoToken?: string): Promise<WalletBalance> {
    const token = cognitoToken || this.getCognitoToken();
    
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/wallet/balance/tutor`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data: WalletBalance = await response.json();
      return data;
    } catch (error) {
      console.error('Error obteniendo balance de tutor:', error);
      throw error;
    }
  }

  /**
   * Notifica al backend sobre un pago exitoso después de que Stripe redirija
   * @param payload - Datos del pago exitoso
   * @param cognitoToken - Token de autenticación de Cognito
   * @returns Promise con la confirmación del procesamiento
   */
  static async handlePaymentSuccess(
    payload: PaymentSuccessPayload,
    cognitoToken?: string
  ): Promise<{ success: boolean; message: string }> {
    const token = cognitoToken || this.getCognitoToken();
    
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/stripe/webhook/success`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error procesando pago exitoso:', error);
      throw error;
    }
  }

  /**
   * Confirma un pago usando solo el sessionId (nuevo flujo simplificado)
   * Endpoint esperado: POST /api/stripe/confirm-payment { sessionId }
   * Devuelve { success: boolean, message: string, tokens?: number, amount?: number }
   */
  static async confirmPayment(sessionId: string): Promise<{ success: boolean; message: string; tokens?: number; amount?: number }> {
    if (!sessionId) throw new Error('sessionId requerido');
    try {
      const resp = await fetch(`${PAYMENT_BASE_URL}/stripe/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const raw = await resp.text();
      let json: any = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch {/* ignore parse error */}
      if (!resp.ok) {
        throw new Error(json.message || raw || `Error HTTP ${resp.status}`);
      }
      if (!json.success) {
        throw new Error(json.message || 'Pago no confirmado por el servidor');
      }
      return json;
    } catch (e:any) {
      if (e?.message === 'Failed to fetch') {
        throw new Error('No se pudo conectar al servicio de pagos para confirmar.');
      }
      throw e;
    }
  }

  /**
   * Transfiere tokens de un estudiante a un tutor cuando se acepta una reservación
   * @param fromUserId - ID del estudiante que paga
   * @param toUserId - ID del tutor que recibe
   * @param tokens - Cantidad de tokens a transferir
   * @param reservationId - ID de la reservación
   * @param cognitoToken - Token de autenticación de Cognito
   * @returns Promise con el resultado de la transferencia
   */
  static async transferTokens(
    fromUserId: string,
    toUserId: string,
    tokens: number,
    reservationId: string,
    cognitoToken?: string
  ): Promise<{ success: boolean; message: string }> {
    const token = cognitoToken || this.getCognitoToken();
    
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/wallet/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          tokens,
          reservationId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error transfiriendo tokens:', error);
      throw error;
    }
  }

  /**
   * Maneja cancelaciones tanto por estudiante como por tutor.
   * Nuevo flujo: el backend determina automáticamente los tokens a reembolsar
   * según el estado de la reservación y si ya hubo transferencia previa.
   * cancelledBy: 'STUDENT' | 'TUTOR'
   */
  static async refundOnCancellation(
    params: {
      fromUserId: string;   // Estudiante
      toUserId: string;     // Tutor
      reservationId: string;
      cancelledBy: 'STUDENT' | 'TUTOR';
      reason?: string;
    },
    cognitoToken?: string
  ): Promise<{ success?: boolean; message?: string; [k: string]: any }> {
    const token = cognitoToken || this.getCognitoToken();
    if (!token) throw new Error('No hay token de autenticación');

    try {
      const response = await fetch(`${PAYMENT_BASE_URL}/wallet/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error procesando cancelación (refund):', error);
      throw error;
    }
  }
}

export default ApiPaymentService;
