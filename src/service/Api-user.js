// src/service/Api-user.js
// Clase para manejar peticiones a la API de UpLearn y gestión de token

const API_BASE_URL = 'http://localhost:8080/Api-user';

class ApiUserService {
  static token = null;

  static setToken(token) {
    this.token = token;
    localStorage.setItem('uplearn_token', token);
  }

  static getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('uplearn_token');
    }
    return this.token;
  }

  static clearToken() {
    this.token = null;
    localStorage.removeItem('uplearn_token');
  }

  // ========== MÉTODOS PARA COGNITO ==========

  /**
   * Establece el token de Cognito actual para usar en las peticiones
   * @param {string} cognitoToken - Token de Cognito
   */
  static setCognitoToken(cognitoToken) {
    this.token = cognitoToken;
    // Opcionalmente también guardarlo en localStorage para persistencia
    localStorage.setItem('uplearn_cognito_token', cognitoToken);
  }

  /**
   * Obtiene el token de Cognito actual
   * @returns {string|null} Token de Cognito
   */
  static getCognitoToken() {
    // Primero intentar obtener del storage local, luego del token actual
    return localStorage.getItem('uplearn_cognito_token') || this.token;
  }

  // Decodifica un JWT y retorna el payload como objeto
  static decodeToken() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded;
    } catch (e) {
      console.error('Error decoding token:', e);
      return null;
    }
  }

  // Obtiene información del usuario autenticado desde el token
  static getCurrentUser() {
    const decoded = this.decodeToken();
    if (!decoded) return null;

    // nosotros en el backend usamos 'sub' para userId y 'role' para el rol
    return decoded ? {
      userId: decoded.sub,    // En JWT estándar, 'sub' es el subject (userId)
      role: decoded.role
    } : null;
  }

  // ========== AUTENTICACIÓN ==========

  /**
   * Autentica un usuario en el sistema
   * @param {string} userId - ID del usuario (no userName)
   * @param {string} password - Contraseña
   * @returns {Promise<AuthenticationResponseDTO>}
   */
  static async login(userId, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          password: password
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Si la autenticación es exitosa, guardar el token
      if (data.authenticated && data.token) {
        this.setToken(data.token);
      }
      
      return data;
    } catch (error) {
      console.error('Error en login:', error);
      throw new Error('Error de conexión. Verifica que el servidor esté disponible.');
    }
  }

  /**
   * Cierra sesión del usuario
   */
  static logout() {
    this.clearToken();
  }

  // ========== ENDPOINTS ESPECÍFICOS PARA ESTUDIANTE ==========

  /**
   * Obtiene el perfil específico de estudiante
   * Solo funciona si el usuario tiene rol STUDENT
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<StudentProfileDTO>}
   */
  static async getStudentProfile(cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/student/profile`, {
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

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error obteniendo perfil de estudiante:', error);
      throw error;
    }
  }

  /**
   * Actualiza el perfil específico de estudiante
   * Solo permite editar campos relacionados con el rol de estudiante
   * @param {Object} studentData - Datos del estudiante según StudentProfileDTO
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<StudentProfileDTO>}
   */
  static async updateStudentProfile(studentData, cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/student/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(studentData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error actualizando perfil de estudiante:', error);
      throw error;
    }
  }

  /**
   * Elimina el rol de estudiante del usuario
   * Si es el único rol, elimina completamente el usuario
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<Object>}
   */
  static async removeStudentRole(cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/student/profile`, {
        method: 'DELETE',
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

      const data = await response.json();
      
      // Si se eliminó completamente el usuario, limpiar token
      if (data.userDeleted) {
        this.clearToken();
      }
      
      return data;
    } catch (error) {
      console.error('Error eliminando rol de estudiante:', error);
      throw error;
    }
  }

  // ========== ENDPOINTS ESPECÍFICOS PARA TUTOR ==========

  /**
   * Obtiene el perfil específico de tutor
   * Solo funciona si el usuario tiene rol TUTOR
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<TutorProfileDTO>}
   */
  static async getTutorProfile(cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/profile`, {
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

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error obteniendo perfil de tutor:', error);
      throw error;
    }
  }

  /**
   * Actualiza el perfil específico de tutor
   * Solo permite editar campos relacionados con el rol de tutor
   * @param {Object} tutorData - Datos del tutor según TutorProfileDTO
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<TutorProfileDTO>}
   */
  static async updateTutorProfile(tutorData, cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(tutorData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error actualizando perfil de tutor:', error);
      throw error;
    }
  }

  /**
   * Elimina el rol de tutor del usuario
   * Si es el único rol, elimina completamente el usuario
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<Object>}
   */
  static async removeTutorRole(cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/profile`, {
        method: 'DELETE',
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

      const data = await response.json();
      
      // Si se eliminó completamente el usuario, limpiar token
      if (data.userDeleted) {
        this.clearToken();
      }
      
      return data;
    } catch (error) {
      console.error('Error eliminando rol de tutor:', error);
      throw error;
    }
  }

  /**
   * Obtiene la tarifa de tokens por hora del tutor autenticado
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<{tokensPerHour: number}>}
   */
  static async getTutorTokensRate(cognitoToken = null) {
    const token = cognitoToken || this.getToken();
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/tokens-rate`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor obteniendo tarifa de tokens:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error obteniendo tarifa de tokens del tutor:', error);
      throw error;
    }
  }

  /**
   * Obtiene la tarifa de tokens por hora de un tutor público por sub o id (sin token)
   * Endpoint esperado: GET /tutor/tokens-rate-by-sub?sub=xxx o ?id=xxx
   * @param {string} idOrSub - Identificador del tutor (sub o id)
   * @returns {Promise<{tokensPerHour:number}>}
   */
  static async getTutorTokensRateBySubOrId(idOrSub) {
    if (!idOrSub) throw new Error('idOrSub requerido');
    const tryFetch = async (queryKey) => {
      const url = `${API_BASE_URL}/tutor/tokens-rate-by-sub?${queryKey}=${encodeURIComponent(idOrSub)}`;
      const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!resp.ok) return null;
      try { return await resp.json(); } catch { return null; }
    };
    // Intentar primero como sub, luego como id
    const bySub = await tryFetch('sub');
    if (bySub && typeof bySub.tokensPerHour !== 'undefined') return bySub;
    const byId = await tryFetch('id');
    if (byId && typeof byId.tokensPerHour !== 'undefined') return byId;
    throw new Error('No se pudo obtener tokensPerHour del tutor');
  }

  /**
   * Obtiene todos los usuarios (requiere autenticación)
   * @returns {Promise<User[]>}
   */
  static async getAllUsers() {
    const token = this.getToken();
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error obteniendo usuarios:', error);
      throw error;
    }
  }

  /**
   * Obtiene un usuario por su ID (requiere autenticación)
   * @param {string} userId - ID del usuario
   * @returns {Promise<User>}
   */
  static async getUserById(userId) {
    const token = this.getToken();
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      throw error;
    }
  }

  // ========== INTEGRACIÓN CON COGNITO ==========

  /**
   * Procesa y registra un usuario de Cognito en el backend
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<{user: User, isNewUser: boolean}>}
   */
  static async processCognitoUser(cognitoToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/process-cognito-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token: cognitoToken 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor procesando Cognito:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Error procesando usuario de Cognito:', error);
      throw error;
    }
  }

  /**
   * Guarda los roles de un usuario en el backend
   * @param {string} cognitoToken - Token de Cognito
   * @param {string|string[]} roles - Rol(es) a asignar ('student', 'tutor', o ambos)
   * @returns {Promise<User>}
   */
  static async saveUserRole(cognitoToken, roles) {
    try {
      // Convertir a array si es un string único
      const roleArray = Array.isArray(roles) ? roles : [roles];
      
      const response = await fetch(`${API_BASE_URL}/save-user-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoToken}`,
        },
        body: JSON.stringify({ 
          roles: roleArray 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor guardando roles:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const user = await response.json();
      
      return user;
    } catch (error) {
      console.error('Error guardando roles de usuario:', error);
      throw error;
    }
  }

  /**
   * Obtiene los roles actuales del usuario autenticado
   * @param {string} cognitoToken - Token de Cognito
   * @returns {Promise<Object>} Información completa de roles del usuario
   */
  static async getMyRoles(cognitoToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/my-roles`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor obteniendo roles:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Error obteniendo roles del usuario:', error);
      throw error;
    }
  }

  /**
   * Verifica el estado de completitud del perfil del usuario autenticado
   * @param {string} cognitoToken - Token de Cognito
   * @param {string} role - Rol específico a verificar ('STUDENT' o 'TUTOR'). Opcional.
   * @returns {Promise<{isComplete: boolean, missingFields: string[], currentRole: string}>}
   */
  static async getProfileStatus(cognitoToken, role = null) {
    try {
      const url = role 
        ? `${API_BASE_URL}/profile-status?role=${role}`
        : `${API_BASE_URL}/profile-status`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor obteniendo estado del perfil:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error obteniendo estado del perfil:', error);
      throw error;
    }
  }

  /**
   * Añade un rol adicional al usuario autenticado
   * @param {string} cognitoToken - Token de Cognito
   * @param {string} userId - ID del usuario
   * @param {string} newRole - Nuevo rol a añadir ('student' o 'tutor')
   * @returns {Promise<Object>} Información actualizada del usuario
   */
  static async addRoleToUser(cognitoToken, userId, newRole) {
    try {
      const response = await fetch(`${API_BASE_URL}/add-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoToken}`,
        },
        body: JSON.stringify({
          userId: userId,
          role: newRole
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor añadiendo rol:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Error añadiendo rol al usuario:', error);
      throw error;
    }
  }

  /**
   * Sube archivos de credenciales para el tutor autenticado.
   * El backend automáticamente: sube a Azure, valida con n8n, y guarda en BD solo documentos académicos válidos.
   * Ahora también crea especializaciones verificadas automáticamente si el documento es validado.
   * @param {string} cognitoToken - Token de Cognito
   * @param {File[]} files - Array de archivos seleccionados
   * @returns {Promise<{totalFiles: number, uploaded: number, validated: number, rejected: number, savedCredentials: string[], details: Array<{fileName: string, uploadedUrl: string, uploaded: boolean, saved: boolean, status: string, addedSpecialization?: string, validation?: object}>}>}
   */
  static async uploadTutorCredentials(cognitoToken, files) {
    if (!cognitoToken) {
      throw new Error('No hay token de autenticación');
    }
    if (!files || files.length === 0) {
      throw new Error('Debe seleccionar al menos un archivo');
    }

    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cognitoToken}`,
          // NOTA: No establecer Content-Type manualmente para multipart
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error subiendo credenciales:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error en uploadTutorCredentials:', error);
      throw error;
    }
  }

  /**
   * Elimina URLs de credenciales del tutor autenticado.
   * Ahora también elimina automáticamente las especializaciones verificadas asociadas a esos documentos.
   * @param {string} cognitoToken - Token de Cognito
   * @param {string[]} urls - Arreglo de URLs a eliminar
   * @returns {Promise<{removedCount: number, remainingCredentials: string[], tutorVerified: boolean, removedSpecializations: string[], deletedFromAzure: number}>} Respuesta del backend con estado y credenciales restantes
   */
  static async deleteTutorCredentials(cognitoToken, urls) {
    if (!cognitoToken) {
      throw new Error('No hay token de autenticación');
    }
    if (!urls || urls.length === 0) {
      throw new Error('Debe proporcionar al menos una URL para eliminar');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/credentials`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoToken}`,
        },
        body: JSON.stringify({ urls })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error eliminando credenciales:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error en deleteTutorCredentials:', error);
      throw error;
    }
  }


}

export default ApiUserService; 
