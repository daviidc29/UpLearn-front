import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from "react-oidc-context";
import ApiUserService from '../service/Api-user';
import '../styles/EditProfilePage.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import type { Specialization, DeleteCredentialsResponse, UploadCredentialsResponse } from '../types/specialization';

interface User {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: 'STUDENT' | 'TUTOR';
  // Campos adicionales del perfil según UserUpdateDTO
  idType?: string;
  idNumber?: string;
  // Perfil de estudiante
  educationLevel?: string;
  // Perfil de tutor
  bio?: string;
  specializations?: Specialization[]; // Ahora es un objeto, no string
  credentials?: string[];
  // Nueva tarifa en tokens por hora (solo tutor)
  tokensPerHour?: number | null;
}

interface UpdateData {
  name?: string;
  email?: string;
  phoneNumber?: string;
  // Campos adicionales del perfil
  idType?: string;
  idNumber?: string;
  // Perfil de estudiante
  educationLevel?: string;
  // Perfil de tutor
  bio?: string;
  specializations?: Specialization[]; // Ahora es un objeto, no string
  credentials?: string[];
  tokensPerHour?: number | null;
}

interface DeleteRoleResponse {
  userDeleted: boolean;
  message?: string;
  remainingRoles?: string[];
}

const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { userRoles, isAuthenticated } = useAuthFlow();
  
  // Obtener el rol específico del state de navegación o usar el primer rol como fallback
  const currentRole = location.state?.currentRole || userRoles?.[0];
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');

  // Estados para los formularios (actualizado según UserUpdateDTO)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    idType: '',
    idNumber: '',
    educationLevel: '',
    bio: '',
    specializations: [] as Specialization[], // Ahora objetos Specialization
    credentials: [] as string[],
    tokensPerHour: '' as string | number // manejado como string hasta submit
  });

  // Estados para inputs dinámicos
  const [specializationInput, setSpecializationInput] = useState('');
  // Estados para subida de credenciales como archivos
  const [credentialFiles, setCredentialFiles] = useState<File[]>([]);
  const [isUploadingCredentials, setIsUploadingCredentials] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [credentialNames, setCredentialNames] = useState<string[]>([]);
  const [isDeletingCredentialIndex, setIsDeletingCredentialIndex] = useState<number | null>(null);

  const deriveNameFromUrl = (url: string): string => {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (!last) return 'Archivo';
      const decoded = decodeURIComponent(last);
      // Limpiar UUIDs y caracteres del servidor, quedarnos solo con el nombre real
      // Ejemplo: "588aed7a-8b45-44d8-ab8d-f7c2eb2e05f5_Taller_Access_Control.pdf" -> "Taller_Access_Control.pdf"
      const cleaned = decoded.replace(/^[a-f0-9-]+_/i, '');
      return cleaned || decoded;
    } catch {
      const parts = url.split('?')[0].split('#')[0].split('/');
      const last = parts.filter(Boolean).pop();
      if (!last) return 'Archivo';
      const decoded = decodeURIComponent(last);
      const cleaned = decoded.replace(/^[a-f0-9-]+_/i, '');
      return cleaned || decoded;
    }
  };

  useEffect(() => {
    const loadUserProfile = async () => {
      // Verificar autenticación con Cognito
      if (!isAuthenticated) {
        navigate('/login');
        return;
      }

      if (!userRoles || userRoles.length === 0) {
        navigate('/login');
        return;
      }

      setIsLoading(true);
      
      try {
        // Obtener datos específicos del rol usando token de Cognito
        if (!auth.user?.id_token) {
          throw new Error('No hay token disponible');
        }
        
        // Validar que el rol específico esté en los roles del usuario
        if (!userRoles?.includes(currentRole)) {
          console.error('❌ Rol no válido o no autorizado:', currentRole);
          throw new Error(`No tienes permisos para editar el perfil de ${currentRole}`);
        }
        
        let editableData;
        
        // Usar endpoint específico según el rol
        if (currentRole === 'student') {
          editableData = await ApiUserService.getStudentProfile(auth.user.id_token);
        } else if (currentRole === 'tutor') {
          editableData = await ApiUserService.getTutorProfile(auth.user.id_token);
        } else {
          throw new Error('Rol de usuario no válido');
        }
        
        // Crear objeto de usuario con datos del token y del backend
        const userData: User = {
          userId: auth.user.profile?.sub || 'unknown',
          name: editableData.name || '',
          email: editableData.email || '',
          phoneNumber: editableData.phoneNumber || '',
          role: currentRole.toUpperCase() as 'STUDENT' | 'TUTOR',
          idType: editableData.idType || '',
          idNumber: editableData.idNumber || '',
          educationLevel: editableData.educationLevel || '',
          bio: editableData.bio || '',
          specializations: editableData.specializations || [],
          credentials: editableData.credentials || [],
          tokensPerHour: editableData.tokensPerHour ?? null
        };

        setCurrentUser(userData);
        setFormData({
          name: editableData.name || '',
          email: editableData.email || '',
          phoneNumber: editableData.phoneNumber || '',
          idType: editableData.idType || '',
          idNumber: editableData.idNumber || '',
          educationLevel: editableData.educationLevel || '',
          bio: editableData.bio || '',
          specializations: editableData.specializations || [],
          credentials: editableData.credentials || [],
          tokensPerHour: (editableData.tokensPerHour != null ? String(editableData.tokensPerHour) : '')
        });
        setCredentialNames((editableData.credentials || []).map((u: string) => deriveNameFromUrl(u)));
        
      } catch (error) {
        console.error('Error cargando perfil:', error);
        setErrors({ 
          general: error instanceof Error ? error.message : 'Error cargando el perfil' 
        });
        
        // Si hay error de autenticación, redirigir al login
        if (error instanceof Error && error.message.includes('401')) {
          navigate('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUserProfile();
  }, [navigate, auth.isAuthenticated, auth.user, userRoles, currentRole]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpiar errores cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const addSpecialization = () => {
    const trimmed = specializationInput.trim();
    if (trimmed && !formData.specializations.some(s => s.name === trimmed)) {
      // Crear especialización manual
      const newSpec: Specialization = {
        name: trimmed,
        verified: false,
        source: 'MANUAL',
        verifiedAt: null,
        documentUrl: null
      };
      setFormData(prev => ({
        ...prev,
        specializations: [...prev.specializations, newSpec]
      }));
      setSpecializationInput('');
    }
  };

  const removeSpecialization = (indexToRemove: number) => {
    const spec = formData.specializations[indexToRemove];
    // No permitir eliminar especializaciones verificadas
    if (spec.verified) {
      alert('No puedes eliminar especializaciones verificadas. Elimina el documento asociado para quitarla.');
      return;
    }
    setFormData(prev => {
      const newSpecializations = prev.specializations.filter((_, i) => i !== indexToRemove);
      return {
        ...prev,
        specializations: newSpecializations
      };
    });
  };

  // Remover credencial (URL) ya subida en backend y UI
  const removeUploadedCredential = async (index: number) => {
    setUploadError('');
    if (!auth.user?.id_token) {
      setUploadError('No hay token de autenticación válido');
      return;
    }
    const url = formData.credentials[index];
    if (!url) return;
    try {
      setIsDeletingCredentialIndex(index);
      const result = await ApiUserService.deleteTutorCredentials(auth.user.id_token, [url]) as DeleteCredentialsResponse;

      // Actualizar credenciales restantes
      const remainingFromBackend = result?.remainingCredentials || [];
      setFormData(prev => ({ ...prev, credentials: remainingFromBackend }));
      setCredentialNames(remainingFromBackend.map((u: string) => deriveNameFromUrl(u)));

      // Notificar especializaciones eliminadas automáticamente
      if (result.removedSpecializations && result.removedSpecializations.length > 0) {
        const removedNames = result.removedSpecializations.join(', ');
        setUploadError(`✓ Credencial eliminada. Las siguientes especializaciones verificadas también fueron eliminadas: ${removedNames}`);
        
        // Recargar perfil para actualizar especializaciones
        try {
          const updatedProfile = await ApiUserService.getTutorProfile(auth.user.id_token);
          setFormData(prev => ({
            ...prev,
            specializations: updatedProfile.specializations || []
          }));
        } catch (e) {
          console.error('Error recargando especializaciones:', e);
        }
      }

      // Mensaje informativo si backend indica verificación
      if (typeof result?.tutorVerified === 'boolean' && !result.tutorVerified) {
        setUploadError('Se eliminaron las credenciales. Tu cuenta quedó no verificada.');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error eliminando credencial');
    } finally {
      setIsDeletingCredentialIndex(null);
    }
  };

  const handleCredentialFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    // Acumular archivos evitando duplicados por nombre+size+lastModified
    setCredentialFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}-${f.size}-${f.lastModified}`));
      const toAdd = files.filter(f => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`));
      return [...prev, ...toAdd];
    });
    // Limpiar el input para permitir volver a elegir los mismos archivos
    if (e.target) {
      try { (e.target as HTMLInputElement).value = ''; } catch {}
    }
  };

  const handleUploadCredentials = async () => {
    if (!auth.user?.id_token) {
      setUploadError('No hay token de autenticación válido');
      return;
    }
    if (credentialFiles.length === 0) {
      setUploadError('Seleccione uno o más archivos');
      return;
    }
    setIsUploadingCredentials(true);
    setUploadError('');
    try {
      const result = await ApiUserService.uploadTutorCredentials(auth.user.id_token, credentialFiles) as UploadCredentialsResponse;
      // result: { totalFiles, uploaded, validated, rejected, savedCredentials: [url...], details: [...] }
      const savedUrls = result.savedCredentials || [];
      
      setFormData(prev => ({
        ...prev,
        credentials: [...(prev.credentials || []), ...savedUrls]
      }));
      
      // Mapear nombres de archivos aceptados
      const acceptedDetails = (result.details || []).filter((d: any) => d.saved);
      const mappedNames = acceptedDetails.map((d: any) => d.fileName || deriveNameFromUrl(d.uploadedUrl));
      setCredentialNames(prev => ([...prev, ...mappedNames]));
      
      setCredentialFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Mostrar especializaciones añadidas automáticamente
      const addedSpecs = acceptedDetails
        .filter((d: any) => d.addedSpecialization)
        .map((d: any) => d.addedSpecialization);
      
      if (addedSpecs.length > 0) {
        const specsText = addedSpecs.join(', ');
        setUploadError(`✓ Credenciales subidas exitosamente. Se añadieron especializaciones verificadas: ${specsText}`);
        
        // Recargar perfil para actualizar especializaciones
        try {
          const updatedProfile = await ApiUserService.getTutorProfile(auth.user.id_token);
          setFormData(prev => ({
            ...prev,
            specializations: updatedProfile.specializations || []
          }));
        } catch (e) {
          console.error('Error recargando especializaciones:', e);
        }
      }
      
      // Mostrar mensaje si hubo archivos rechazados
      if (result.rejected && result.rejected > 0) {
        const rejectedFiles = (result.details || [])
          .filter((d: any) => d.status === 'rejected')
          .map((d: any) => `${d.fileName}: ${d.reason}`)
          .join(', ');
        setUploadError(`${result.validated} archivo(s) validado(s), ${result.rejected} rechazado(s): ${rejectedFiles}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error subiendo credenciales');
    } finally {
      setIsUploadingCredentials(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es requerido';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'El teléfono es requerido';
    }

    if (currentRole === 'student' && !formData.educationLevel.trim()) {
      newErrors.educationLevel = 'El nivel educativo es requerido';
    }

    if (currentRole === 'tutor') {
      if (!formData.bio.trim()) {
        newErrors.bio = 'La biografía es requerida';
      }
      if (formData.specializations.length === 0) {
        newErrors.specializations = 'Debe tener al menos una especialización';
      }
      if (String(formData.tokensPerHour).trim() !== '') {
        const val = parseInt(String(formData.tokensPerHour), 10);
        if (isNaN(val) || val <= 0) {
          newErrors.tokensPerHour = 'Ingresa un número válido (>0)';
        }
      }
      // Las credenciales ya no son obligatorias
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!auth.user?.id_token) {
      setErrors({ general: 'No hay token de autenticación válido' });
      return;
    }

    setIsSaving(true);
    setErrors({});
    setSuccessMessage('');

    try {
      const updateData: UpdateData = {
        name: formData.name,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        idType: formData.idType,
        idNumber: formData.idNumber
      };

      // Agregar campos específicos según el rol
      if (currentRole === 'student') {
        updateData.educationLevel = formData.educationLevel;
      } else if (currentRole === 'tutor') {
        updateData.bio = formData.bio;
        updateData.specializations = formData.specializations;
        updateData.credentials = formData.credentials;
        if (String(formData.tokensPerHour).trim() !== '') {
          const parsed = parseInt(String(formData.tokensPerHour), 10);
          if (!isNaN(parsed) && parsed > 0) {
            updateData.tokensPerHour = parsed;
          }
        } else {
          updateData.tokensPerHour = null;
        }
      }

      // Usar endpoint específico según el rol actual
      let updatedUser;
      if (currentRole === 'student') {
        updatedUser = await ApiUserService.updateStudentProfile(updateData, auth.user.id_token);
      } else if (currentRole === 'tutor') {
        updatedUser = await ApiUserService.updateTutorProfile(updateData, auth.user.id_token);
      } else {
        throw new Error('Rol de usuario no válido para actualización');
      }
      
      setSuccessMessage('¡Perfil actualizado exitosamente!');

      // redirigir después de unos segundos
      setTimeout(() => {
        if (currentRole === 'student') {
          navigate('/student-dashboard');
        } else if (currentRole === 'tutor') {
          navigate('/tutor-dashboard');
        } else {
          navigate('/');
        }
      }, 2000);

    } catch (error) {
      console.error('Error actualizando perfil:', error);
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error actualizando el perfil' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (currentRole === 'student') {
      navigate('/student-dashboard');
    } else if (currentRole === 'tutor') {
      navigate('/tutor-dashboard');
    } else {
      navigate('/');
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
  };

  const handleConfirmDelete = async () => {
    if (!auth.user?.id_token) {
      setErrors({ general: 'No hay token de autenticación válido' });
      return;
    }

    setIsDeleting(true);
    setErrors({});

    try {
      // Usar endpoint específico según el rol para eliminar
      let result: DeleteRoleResponse;
      if (currentRole === 'student') {
        result = await ApiUserService.removeStudentRole(auth.user.id_token) as DeleteRoleResponse;
      } else if (currentRole === 'tutor') {
        result = await ApiUserService.removeTutorRole(auth.user.id_token) as DeleteRoleResponse;
      } else {
        throw new Error('Rol de usuario no válido para eliminación');
      }
      
      if (result.userDeleted) {
        // Si se eliminó completamente el usuario
        alert('Tu cuenta ha sido eliminada completamente.');
        // Limpiar datos de autenticación y redirigir
        auth.removeUser();
        navigate('/');
      } else {
        // Si solo se eliminó el rol específico
        const roleText = currentRole === 'student' ? 'estudiante' : 'tutor';
        alert(`Tu rol de ${roleText} ha sido eliminado. ${result.message || ''}`);
        
        // Verificar si el usuario tiene otros roles para redirigir apropiadamente
        if (result.remainingRoles && result.remainingRoles.length > 0) {
          // Redirigir al dashboard del rol restante
          const remainingRole = result.remainingRoles[0];
          if (remainingRole === 'student') {
            navigate('/student-dashboard');
          } else if (remainingRole === 'tutor') {
            navigate('/tutor-dashboard');
          } else {
            navigate('/role-selection');
          }
        } else {
          // No quedan roles, ir a selección de roles
          navigate('/role-selection');
        }
      }
      
    } catch (error) {
      console.error('Error eliminando cuenta/rol:', error);
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error eliminando la cuenta' 
      });
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner-icon">⏳</div>
          <p>Cargando datos del perfil...</p>
        </div>
      </div>
    );
  }

  if (!currentUser && !isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner error">
          <div className="spinner-icon">❌</div>
          <p>Error cargando el perfil</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Volver al Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-profile-container">
      <div className="edit-profile-content">
        <div className="profile-header">
          <h1>Editar Perfil</h1>
          <p>Actualiza tu información personal</p>
          <div className="user-role-badge">
            {currentRole === 'student' ? '🎓 Estudiante' : '👨‍🏫 Tutor'}
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          {/* Mensajes de error y éxito */}
          {errors.general && (
            <div className="alert alert-error">
              {errors.general}
            </div>
          )}
          
          {successMessage && (
            <div className="alert alert-success">
              {successMessage}
            </div>
          )}

          {/* Campos comunes */}
          <div className="form-section">
            <h2>Información Personal</h2>
            
            <div className="form-group">
              <label className="form-label">Nombre Completo</label>
              <input
                type="text"
                name="name"
                className={`form-input ${errors.name ? 'error' : ''}`}
                placeholder="Tu nombre completo"
                value={formData.name}
                onChange={handleInputChange}
                disabled={isSaving}
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                className={`form-input ${errors.email ? 'error' : ''}`}
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isSaving}
              />
              {errors.email && <span className="error-message">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input
                type="tel"
                name="phoneNumber"
                className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                placeholder="Número de teléfono"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                disabled={isSaving}
              />
              {errors.phoneNumber && <span className="error-message">{errors.phoneNumber}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Identificación</label>
              <select
                name="idType"
                className={`form-input ${errors.idType ? 'error' : ''}`}
                value={formData.idType}
                onChange={handleInputChange}
                disabled={isSaving}
              >
                <option value="">Selecciona tipo de identificación</option>
                <option value="CC">Cédula de Ciudadanía</option>
                <option value="CE">Cédula de Extranjería</option>
                <option value="TI">Tarjeta de Identidad</option>
                <option value="PP">Pasaporte</option>
                <option value="RC">Registro Civil</option>
              </select>
              {errors.idType && <span className="error-message">{errors.idType}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Número de Identificación</label>
              <input
                type="text"
                name="idNumber"
                className={`form-input ${errors.idNumber ? 'error' : ''}`}
                placeholder="Número de identificación"
                value={formData.idNumber}
                onChange={handleInputChange}
                disabled={isSaving}
              />
              {errors.idNumber && <span className="error-message">{errors.idNumber}</span>}
            </div>
          </div>

          {/* Campos específicos para estudiante */}
          {currentRole === 'student' && (
            <div className="form-section">
              <h2>Información Académica</h2>
              
              <div className="form-group">
                <label className="form-label">Nivel Educativo</label>
                <select
                  name="educationLevel"
                  className={`form-input ${errors.educationLevel ? 'error' : ''}`}
                  value={formData.educationLevel}
                  onChange={handleInputChange}
                  disabled={isSaving}
                >
                  <option value="">Selecciona tu nivel educativo</option>
                  <option value="PRIMARIA">Primaria</option>
                  <option value="SECUNDARIA">Secundaria</option>
                  <option value="PREGRADO">Pregrado</option>
                  <option value="POSTGRADO">Postgrado</option>
                  <option value="OTRO">Otro</option>
                </select>
                {errors.educationLevel && <span className="error-message">{errors.educationLevel}</span>}
              </div>
            </div>
          )}

          {/* Campos específicos para tutor */}
          {currentRole === 'tutor' && (
            <div className="form-section">
              <h2>Información Profesional</h2>
              
              <div className="form-group">
                <label className="form-label">Biografía</label>
                <textarea
                  name="bio"
                  className={`form-input form-textarea ${errors.bio ? 'error' : ''}`}
                  placeholder="Cuéntanos sobre tu experiencia y enfoque como tutor..."
                  rows={4}
                  value={formData.bio}
                  onChange={handleInputChange}
                  disabled={isSaving}
                />
                {errors.bio && <span className="error-message">{errors.bio}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Tokens por Hora</label>
                <input
                  type="number"
                  name="tokensPerHour"
                  min={1}
                  className={`form-input ${errors.tokensPerHour ? 'error' : ''}`}
                  placeholder="Ej: 50"
                  value={formData.tokensPerHour}
                  onChange={handleInputChange}
                  disabled={isSaving}
                />
                {errors.tokensPerHour && <span className="error-message">{errors.tokensPerHour}</span>}
                <p className="help-text">Tarifa en tokens que cobrarás por cada hora de tutoría. Déjalo vacío si aún no decides.</p>
              </div>

              <div className="form-group">
                <label className="form-label">Especializaciones</label>
                <div className="array-input-container">
                  <div className="array-input-row">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ej: Matemáticas, Física, Programación..."
                      value={specializationInput}
                      onChange={(e) => setSpecializationInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialization())}
                      disabled={isSaving}
                    />
                    <button 
                      type="button" 
                      className="add-button" 
                      onClick={addSpecialization}
                      disabled={isSaving}
                    >
                      Agregar
                    </button>
                  </div>
                  <div className="tags-container">
                    {formData.specializations.map((spec, index) => (
                      <span 
                        key={index} 
                        className={`tag specialization-tag ${spec.verified ? 'verified' : 'manual'}`}
                        title={spec.verified ? `Verificado por IA el ${new Date(spec.verifiedAt || '').toLocaleDateString()}` : 'Agregado manualmente'}
                      >
                        {spec.verified && <span className="verified-icon">✓</span>}
                        {spec.name}
                        <button 
                          type="button" 
                          onClick={() => removeSpecialization(index)}
                          disabled={isSaving || spec.verified}
                          className={spec.verified ? 'disabled-remove' : ''}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {errors.specializations && <span className="error-message">{errors.specializations}</span>}
                  <p className="help-text">Las especializaciones con ✓ fueron verificadas automáticamente. Para eliminarlas, elimina el documento asociado.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Credenciales (Archivos)</label>
                <div className="upload-credentials-container">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    ref={fileInputRef}
                    onChange={handleCredentialFilesChange}
                    disabled={isSaving || isUploadingCredentials}
                  />
                  {credentialFiles.length > 0 && (
                    <div className="pending-files">
                      <p><strong>Archivos seleccionados:</strong></p>
                      <ul>
                        {credentialFiles.map((f, i) => (
                          <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                            {f.name}
                            <button
                              type="button"
                              className="remove-credential-btn"
                              onClick={() => setCredentialFiles(prev => prev.filter((_, idx) => idx !== i))}
                              disabled={isUploadingCredentials}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="add-button"
                        onClick={handleUploadCredentials}
                        disabled={isUploadingCredentials}
                      >
                        {isUploadingCredentials ? 'Subiendo...' : 'Subir Credenciales'}
                      </button>
                    </div>
                  )}
                  {uploadError && <span className="error-message">{uploadError}</span>}
                  <div className="uploaded-credentials">
                    <p><strong>Credenciales Subidas:</strong></p>
                    {formData.credentials.length === 0 && <p className="muted">No hay credenciales aún.</p>}
                    <ul className="credentials-list">
                      {formData.credentials.map((url, index) => (
                        <li key={index}>
                          <a href={url} target="_blank" rel="noopener noreferrer">{credentialNames[index] || deriveNameFromUrl(url) || `Credencial ${index + 1}`}</a>
                          <button
                            type="button"
                            className="remove-credential-btn"
                            onClick={() => removeUploadedCredential(index)}
                            disabled={isSaving || isDeletingCredentialIndex === index}
                          >
                            {isDeletingCredentialIndex === index ? '…' : '×'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {errors.credentials && <span className="error-message">{errors.credentials}</span>}
                  <p className="help-text">Sube diplomas, certificados o títulos en PDF o imagen.</p>
                </div>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="form-actions">
            <div className="main-actions">
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isSaving || isDeleting}
              >
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={isSaving || isDeleting}
              >
                Cancelar
              </button>
            </div>
            
            {/* Botón de eliminar rol/cuenta */}
            <div className="danger-zone">
              <button 
                type="button" 
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={isSaving || isDeleting}
              >
                🗑️ Eliminar {currentRole === 'student' ? 'Rol de Estudiante' : 'Rol de Tutor'}
              </button>
              <p className="danger-text">
                {userRoles && userRoles.length > 1 
                  ? `Se eliminará tu rol de ${currentRole === 'student' ? 'estudiante' : 'tutor'}. Si es tu único rol, se eliminará toda la cuenta.`
                  : 'Al ser tu único rol, esta acción eliminará completamente tu cuenta y no se puede deshacer.'
                }
              </p>
            </div>
          </div>
        </form>

        {/* Modal de confirmación de eliminación */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={handleCancelDelete}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>⚠️ Confirmar Eliminación de Rol</h2>
              </div>
              
              <div className="modal-body">
                <p><strong>¿Estás seguro de que deseas eliminar tu rol de {currentRole === 'student' ? 'estudiante' : 'tutor'}?</strong></p>
                
                {userRoles && userRoles.length > 1 ? (
                  <>
                    <p>Se eliminará únicamente tu rol de {currentRole === 'student' ? 'estudiante' : 'tutor'}, pero mantendrás acceso con tus otros roles.</p>
                    <p>Se eliminará:</p>
                  </>
                ) : (
                  <>
                    <p>Al ser tu único rol, esta acción eliminará completamente tu cuenta.</p>
                    <p>Se eliminará permanentemente:</p>
                  </>
                )}
                
                <ul>
                  <li>✗ Tu perfil personal</li>
                  <li>✗ Toda tu información de contacto</li>
                  {currentRole === 'student' && (
                    <li>✗ Tu historial académico y tareas</li>
                  )}
                  {currentRole === 'tutor' && (
                    <>
                      <li>✗ Tu biografía y especializaciones</li>
                      <li>✗ Tus credenciales y certificaciones</li>
                    </>
                  )}
                  <li>✗ Todo el historial de actividades</li>
                </ul>
                <p className="warning-text">
                  <strong>Esta acción NO se puede deshacer.</strong>
                </p>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn btn-danger"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Eliminando...' : `Sí, Eliminar ${currentRole === 'student' ? 'Rol de Estudiante' : 'Rol de Tutor'}`}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditProfilePage;