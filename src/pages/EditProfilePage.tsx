import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import ApiUserService from '../service/Api-user';
import '../styles/EditProfilePage.css';
import { useAuthFlow } from '../utils/useAuthFlow';
import type {
  Specialization,
  DeleteCredentialsResponse,
  UploadCredentialsResponse
} from '../types/specialization';
import '../styles/Recommendations.css';

import { getTutorRatingSummary, getTutorReviews, type TutorReview } from '../service/Api-reviews';
import { getPublicProfile } from '../service/Api-user-public';

interface User {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: 'STUDENT' | 'TUTOR';
  idType?: string;
  idNumber?: string;
  educationLevel?: string;
  bio?: string;
  specializations?: Specialization[];
  credentials?: string[];
  tokensPerHour?: number | null;
}

interface UpdateData {
  name?: string;
  email?: string;
  phoneNumber?: string;
  idType?: string;
  idNumber?: string;
  educationLevel?: string;
  bio?: string;
  specializations?: Specialization[];
  credentials?: string[];
  tokensPerHour?: number | null;
}

interface DeleteRoleResponse {
  userDeleted: boolean;
  message?: string;
  remainingRoles?: string[];
}

type RoleKey = 'student' | 'tutor';

function normalizeRole(input: unknown): RoleKey | null {
  if (typeof input !== 'string') return null;
  const r = input.trim().toLowerCase();
  if (r === 'student' || r === 'estudiante' || r === 'role_student' || r === 'students') return 'student';
  if (r === 'tutor' || r === 'teacher' || r === 'role_tutor' || r === 'tutors') return 'tutor';
  if (r === 'student'.toUpperCase().toLowerCase()) return 'student';
  if (r === 'tutor'.toUpperCase().toLowerCase()) return 'tutor';
  if (r === 'student'.toLowerCase()) return 'student';
  if (r === 'tutor'.toLowerCase()) return 'tutor';

  // Soportar si llegan como "STUDENT"/"TUTOR"
  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';
  if (r === 'student'.toLowerCase()) return 'student';
  if (r === 'tutor'.toLowerCase()) return 'tutor';

  if (r === 'student' || r === 'tutor') return r as RoleKey;
  if (r === 'student' || r === 'tutor') return r as RoleKey;

  if (r === 'student' || r === 'tutor') return r as RoleKey;
  if (r === 'student' || r === 'tutor') return r as RoleKey;

  if (r === 'student' || r === 'tutor') return r as RoleKey;
  if (r === 'student' || r === 'tutor') return r as RoleKey;

  if (r === 'student' || r === 'tutor') return r as RoleKey;
  if (r === 'student' || r === 'tutor') return r as RoleKey;

  if (r === 'student' || r === 'tutor') return r as RoleKey;
  if (r === 'student' || r === 'tutor') return r as RoleKey;

  if (r === 'student' || r === 'tutor') return r as RoleKey;

  // normalizaciones típicas
  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';
  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';

  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';

  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';

  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';

  if (r === 'student') return 'student';
  if (r === 'tutor') return 'tutor';

  // si llegan exactos:
  if (input === 'STUDENT') return 'student';
  if (input === 'TUTOR') return 'tutor';

  return null;
}
const StarBar: React.FC<{ value: number; size?: number }> = ({ value, size = 18 }) => {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  const full = Math.floor(v);
  const frac = v - full;
  const half = frac >= 0.25 && frac < 0.75;

  const arr = Array.from({ length: 5 }, (_, i) => {
    if (i < full) return 'full';
    if (i === full && half) return 'half';
    return 'empty';
  });

  return (
    <span className="starbar" style={{ gap: 2 }}>
      {arr.map((k, i) => (
        <span key={i} aria-hidden className={`star ${k}`} style={{ fontSize: size, lineHeight: 1 }}>
          ★
        </span>
      ))}
    </span>
  );
};

function getReviewerKey(r: TutorReview): string | null {
  const anyR: any = r as any;
  const key =
    (anyR?.studentId ??
      anyR?.studentSub ??
      anyR?.studentUserId ??
      anyR?.student ??
      anyR?.reviewerId ??
      anyR?.fromUserId ??
      '') + '';
  const trimmed = key.trim();
  return trimmed ? trimmed : null;
}

function getReviewerNameFallback(r: TutorReview): string | null {
  const anyR: any = r as any;
  const name =
    (anyR?.studentName ??
      anyR?.reviewerName ??
      anyR?.fromName ??
      anyR?.name ??
      '') + '';
  const trimmed = name.trim();
  return trimmed ? trimmed : null;
}

const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { userRoles, isAuthenticated: isAuthenticatedFlow } = useAuthFlow();

  const currentRole: RoleKey | null = useMemo(() => {
    const fromNav = (location.state as any)?.currentRole;
    const fallback = userRoles?.[0];
    return normalizeRole(fromNav) ?? normalizeRole(fallback) ?? null;
  }, [location.state, userRoles]);

  const normalizedUserRoles: RoleKey[] = useMemo(() => {
    return (userRoles || [])
      .map((r) => normalizeRole(r))
      .filter((r): r is RoleKey => Boolean(r));
  }, [userRoles]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [reviews, setReviews] = useState<TutorReview[]>([]);
  const [reviewIdx, setReviewIdx] = useState<number>(0);
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    idType: '',
    idNumber: '',
    educationLevel: '',
    bio: '',
    specializations: [] as Specialization[],
    credentials: [] as string[],
    tokensPerHour: '' as string | number
  });

  const [specializationInput, setSpecializationInput] = useState('');
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
    let cancelled = false;

    const loadMyTutorReviews = async () => {
      if (currentRole !== 'tutor') {
        setRatingAvg(0);
        setRatingCount(0);
        setReviews([]);
        setNameByUserId({});
        setReviewIdx(0);
        return;
      }

      const token = auth.user?.id_token;
      const tutorId = (auth.user?.profile as any)?.sub;

      if (!token || !tutorId) return;

      try {
        const [sum, list] = await Promise.all([
          getTutorRatingSummary(tutorId, token),
          getTutorReviews(tutorId, 50, token),
        ]);

        if (cancelled) return;

        const nextReviews = Array.isArray(list) ? list : [];
        setRatingAvg(sum?.avg ?? 0);
        setRatingCount(sum?.count ?? 0);
        setReviews(nextReviews);
        setReviewIdx(0);

        // resolver nombres reales de estudiantes
        const keys = Array.from(new Set(nextReviews.map(getReviewerKey).filter(Boolean) as string[]));

        if (keys.length) {
          const entries = await Promise.all(
            keys.map(async (k) => {
              try {
                const p = await getPublicProfile({ id: k }, token).catch(async () => {
                  return await getPublicProfile({ sub: k }, token);
                });
                return [k, (p?.name || '').trim()] as const;
              } catch {
                return [k, ''] as const;
              }
            })
          );

          if (cancelled) return;

          setNameByUserId((prev) => {
            const next = { ...prev };
            for (const [k, n] of entries) if (n) next[k] = n;
            return next;
          });
        }
      } catch {
        if (!cancelled) {
          setRatingAvg(0);
          setRatingCount(0);
          setReviews([]);
          setNameByUserId({});
          setReviewIdx(0);
        }
      }
    };

    loadMyTutorReviews();
    return () => {
      cancelled = true;
    };
  }, [currentRole, auth.user?.id_token, auth.user?.profile]);

  useEffect(() => {
    let cancelled = false;

    const loadUserProfile = async () => {
      // auth.isAuthenticated suele ser el source of truth del OIDC, pero respetamos tu flujo también.
      const isAuthed = Boolean(auth.isAuthenticated && isAuthenticatedFlow);

      if (!isAuthed) {
        navigate('/login');
        return;
      }

      if (!normalizedUserRoles || normalizedUserRoles.length === 0) {
        navigate('/login');
        return;
      }

      if (!currentRole) {
        setErrors({ general: 'No se pudo determinar tu rol para editar el perfil.' });
        return;
      }

      setIsLoading(true);

      try {
        if (!auth.user?.id_token) {
          throw new Error('No hay token disponible');
        }

        if (!normalizedUserRoles.includes(currentRole)) {
          throw new Error(`No tienes permisos para editar el perfil de ${currentRole}`);
        }

        let editableData: any;

        if (currentRole === 'student') {
          editableData = await ApiUserService.getStudentProfile(auth.user.id_token);
        } else if (currentRole === 'tutor') {
          editableData = await ApiUserService.getTutorProfile(auth.user.id_token);
        } else {
          throw new Error('Rol de usuario no válido');
        }

        const userData: User = {
          userId: (auth.user.profile as any)?.sub || 'unknown',
          name: editableData?.name || '',
          email: editableData?.email || '',
          phoneNumber: editableData?.phoneNumber || '',
          role: currentRole === 'student' ? 'STUDENT' : 'TUTOR',
          idType: editableData?.idType || '',
          idNumber: editableData?.idNumber || '',
          educationLevel: editableData?.educationLevel || '',
          bio: editableData?.bio || '',
          specializations: editableData?.specializations || [],
          credentials: editableData?.credentials || [],
          tokensPerHour: editableData?.tokensPerHour ?? null
        };

        if (cancelled) return;

        setCurrentUser(userData);
        setFormData({
          name: editableData?.name || '',
          email: editableData?.email || '',
          phoneNumber: editableData?.phoneNumber || '',
          idType: editableData?.idType || '',
          idNumber: editableData?.idNumber || '',
          educationLevel: editableData?.educationLevel || '',
          bio: editableData?.bio || '',
          specializations: editableData?.specializations || [],
          credentials: editableData?.credentials || [],
          tokensPerHour: editableData?.tokensPerHour != null ? String(editableData.tokensPerHour) : ''
        });

        setCredentialNames((editableData?.credentials || []).map((u: string) => deriveNameFromUrl(u)));
      } catch (error) {
        console.error('Error cargando perfil:', error);
        if (cancelled) return;

        setErrors({
          general: error instanceof Error ? error.message : 'Error cargando el perfil'
        });

        if (error instanceof Error && error.message.includes('401')) {
          navigate('/login');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadUserProfile();

    return () => {
      cancelled = true;
    };
  }, [
    navigate,
    auth.isAuthenticated,
    auth.user?.id_token,
    auth.user?.profile,
    isAuthenticatedFlow,
    currentRole,
    normalizedUserRoles
  ]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const addSpecialization = () => {
    const trimmed = specializationInput.trim();
    if (!trimmed) return;

    const exists = formData.specializations.some(
      (s) => s.name.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (!exists) {
      const newSpec: Specialization = {
        name: trimmed,
        verified: false,
        source: 'MANUAL',
        verifiedAt: null,
        documentUrl: null
      };

      setFormData((prev) => ({
        ...prev,
        specializations: [...prev.specializations, newSpec]
      }));
    }

    setSpecializationInput('');
  };

  const removeSpecialization = (indexToRemove: number) => {
    const spec = formData.specializations[indexToRemove];
    if (spec?.verified) {
      alert(
        'No puedes eliminar especializaciones verificadas. Elimina el documento asociado para quitarla.'
      );
      return;
    }

    setFormData((prev) => ({
      ...prev,
      specializations: prev.specializations.filter((_, i) => i !== indexToRemove)
    }));
  };

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
      const result = (await ApiUserService.deleteTutorCredentials(auth.user.id_token, [
        url
      ])) as DeleteCredentialsResponse;

      const remainingFromBackend = result?.remainingCredentials || [];
      setFormData((prev) => ({ ...prev, credentials: remainingFromBackend }));
      setCredentialNames(remainingFromBackend.map((u: string) => deriveNameFromUrl(u)));

      if (result?.removedSpecializations?.length) {
        const removedNames = result.removedSpecializations.join(', ');
        setUploadError(
          `✓ Credencial eliminada. También se eliminaron especializaciones verificadas: ${removedNames}`
        );

        try {
          const updatedProfile = await ApiUserService.getTutorProfile(auth.user.id_token);
          setFormData((prev) => ({
            ...prev,
            specializations: updatedProfile?.specializations || []
          }));
        } catch (e) {
          console.error('Error recargando especializaciones:', e);
        }
      }

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

    setCredentialFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const toAdd = files.filter((f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`));
      return [...prev, ...toAdd];
    });

    try {
      e.target.value = '';
    } catch {
      // ignore
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
      const result = (await ApiUserService.uploadTutorCredentials(
        auth.user.id_token,
        credentialFiles
      )) as UploadCredentialsResponse;

      const savedUrls =
        (result as any)?.savedCredentials?.filter(Boolean)
        ?? ((result as any)?.details ?? [])
          .filter((d: any) => d?.saved && d?.uploadedUrl)
          .map((d: any) => d.uploadedUrl);

      setFormData((prev) => {
        const prevCreds = prev.credentials || [];
        const merged = [...prevCreds];
        for (const u of savedUrls) if (!merged.includes(u)) merged.push(u);

        setCredentialNames(merged.map(deriveNameFromUrl));

        return { ...prev, credentials: merged };
      });



      const acceptedDetails = (result?.details || []).filter((d: any) => d?.saved);
      const mappedNames = acceptedDetails.map(
        (d: any) => d?.fileName || (d?.uploadedUrl ? deriveNameFromUrl(d.uploadedUrl) : 'Archivo')
      );

      setCredentialNames((prev) => [...prev, ...mappedNames]);

      setCredentialFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const addedSpecs = acceptedDetails
        .filter((d: any) => d?.addedSpecialization)
        .map((d: any) => d.addedSpecialization);

      if (addedSpecs.length > 0) {
        setUploadError(
          `✓ Credenciales subidas exitosamente. Se añadieron especializaciones verificadas: ${addedSpecs.join(
            ', '
          )}`
        );

        try {
          const updatedProfile = await ApiUserService.getTutorProfile(auth.user.id_token);
          setFormData((prev) => ({
            ...prev,
            specializations: updatedProfile?.specializations || []
          }));
        } catch (e) {
          console.error('Error recargando especializaciones:', e);
        }
      }

      if (result?.rejected && result.rejected > 0) {
        const rejectedFiles = (result.details || [])
          .filter((d: any) => d?.status === 'rejected')
          .map((d: any) => `${d.fileName}: ${d.reason}`)
          .join(', ');
        setUploadError(`${result.validated} validado(s), ${result.rejected} rechazado(s): ${rejectedFiles}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error subiendo credenciales');
    } finally {
      setIsUploadingCredentials(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';

    if (!formData.email.trim()) newErrors.email = 'El email es requerido';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';

    if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'El teléfono es requerido';

    if (currentRole === 'student' && !formData.educationLevel.trim()) {
      newErrors.educationLevel = 'El nivel educativo es requerido';
    }

    if (currentRole === 'tutor') {
      if (!formData.bio.trim()) newErrors.bio = 'La biografía es requerida';
      if (formData.specializations.length === 0) newErrors.specializations = 'Debe tener al menos una especialización';

      if (String(formData.tokensPerHour).trim() !== '') {
        const val = parseInt(String(formData.tokensPerHour), 10);
        if (isNaN(val) || val <= 0) newErrors.tokensPerHour = 'Ingresa un número válido (>0)';
      }

    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentRole) {
      setErrors({ general: 'Rol no válido. Vuelve a iniciar sesión.' });
      return;
    }

    if (!validateForm()) return;

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

      if (currentRole === 'student') {
        updateData.educationLevel = formData.educationLevel;
      } else if (currentRole === 'tutor') {
        updateData.bio = formData.bio;
        updateData.specializations = formData.specializations;
        updateData.credentials = formData.credentials;

        if (String(formData.tokensPerHour).trim() !== '') {
          const parsed = parseInt(String(formData.tokensPerHour), 10);
          updateData.tokensPerHour = !isNaN(parsed) && parsed > 0 ? parsed : null;
        } else {
          updateData.tokensPerHour = null;
        }
      }

      if (currentRole === 'student') {
        await ApiUserService.updateStudentProfile(updateData, auth.user.id_token);
      } else {
        await ApiUserService.updateTutorProfile(updateData, auth.user.id_token);
      }

      setSuccessMessage('¡Perfil actualizado exitosamente!');

      setTimeout(() => {
        if (currentRole === 'student') navigate('/student-dashboard');
        else navigate('/tutor-dashboard');
      }, 1200);
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
    if (currentRole === 'student') navigate('/student-dashboard');
    else if (currentRole === 'tutor') navigate('/tutor-dashboard');
    else navigate('/');
  };

  const handleDeleteAccount = () => setShowDeleteModal(true);
  const handleCancelDelete = () => setShowDeleteModal(false);

  const handleConfirmDelete = async () => {
    if (!currentRole) {
      setErrors({ general: 'Rol no válido. Vuelve a iniciar sesión.' });
      return;
    }

    if (!auth.user?.id_token) {
      setErrors({ general: 'No hay token de autenticación válido' });
      return;
    }

    setIsDeleting(true);
    setErrors({});

    try {
      let result: DeleteRoleResponse;

      if (currentRole === 'student') {
        result = (await ApiUserService.removeStudentRole(auth.user.id_token)) as DeleteRoleResponse;
      } else if (currentRole === 'tutor') {
        result = (await ApiUserService.removeTutorRole(auth.user.id_token)) as DeleteRoleResponse;
      } else {
        throw new Error('Rol de usuario no válido para eliminación');
      }

      if (result.userDeleted) {
        alert('Tu cuenta ha sido eliminada completamente.');
        await auth.removeUser();
        navigate('/');
        return;
      }

      const roleText = currentRole === 'student' ? 'estudiante' : 'tutor';
      alert(`Tu rol de ${roleText} ha sido eliminado. ${result.message || ''}`);

      const remaining = (result.remainingRoles || [])
        .map((r) => normalizeRole(r))
        .filter((r): r is RoleKey => Boolean(r));

      if (remaining.length > 0) {
        const remainingRole = remaining[0];
        if (remainingRole === 'student') navigate('/student-dashboard');
        else if (remainingRole === 'tutor') navigate('/tutor-dashboard');
        else navigate('/role-selection');
      } else {
        navigate('/role-selection');
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
          {errors.general && <div className="alert alert-error">{errors.general}</div>}
          {successMessage && <div className="alert alert-success">{successMessage}</div>}

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
                {errors.educationLevel && (
                  <span className="error-message">{errors.educationLevel}</span>
                )}
              </div>
            </div>
          )}

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
                {errors.tokensPerHour && (
                  <span className="error-message">{errors.tokensPerHour}</span>
                )}
                <p className="help-text">
                  Tarifa en tokens que cobrarás por cada hora de tutoría. Déjalo vacío si aún no decides.
                </p>
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSpecialization();
                        }
                      }}
                      disabled={isSaving}
                    />
                    <button type="button" className="add-button" onClick={addSpecialization} disabled={isSaving}>
                      Agregar
                    </button>
                  </div>

                  <div className="tags-container">
                    {formData.specializations.map((spec, index) => {
                      const hasDate = Boolean(spec.verifiedAt);
                      const title = spec.verified
                        ? `Verificado por IA${hasDate ? ` el ${new Date(spec.verifiedAt as any).toLocaleDateString()}` : ''}`
                        : 'Agregado manualmente';

                      return (
                        <span
                          key={`${spec.name}-${index}`}
                          className={`tag specialization-tag ${spec.verified ? 'verified' : 'manual'}`}
                          title={title}
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
                      );
                    })}
                  </div>

                  {errors.specializations && (
                    <span className="error-message">{errors.specializations}</span>
                  )}
                  <p className="help-text">
                    Las especializaciones con ✓ fueron verificadas automáticamente. Para eliminarlas, elimina el documento asociado.
                  </p>
                </div>
              </div>
              {/* --- Recomendación + Mis reseñas --- */}
              <div className="form-group">
                <label className="form-label">Recomendación</label>
                <div className="rating-inline">
                  <StarBar value={ratingAvg} />
                  <span className="rating-number">
                    <span className="rating-icon">★</span>
                    {(Number.isFinite(ratingAvg) ? ratingAvg : 0).toFixed(1)}
                  </span>
                  <span style={{ color: '#6B7280', fontSize: 12 }}>
                    {ratingCount > 0 ? `(${ratingCount})` : '(0)'}
                  </span>
                </div>
              </div>

              <div className="form-section">
                <h2>Mis reseñas</h2>

                {reviews.length === 0 ? (
                  <p className="muted">Aún no tienes reseñas.</p>
                ) : (
                  (() => {
                    const r = reviews[reviewIdx];
                    const key = r ? getReviewerKey(r) : null;
                    const reviewerName =
                      (r ? getReviewerNameFallback(r) : null) ||
                      (key ? nameByUserId[key] : '') ||
                      'Usuario';

                    return (
                      <div className="review-carousel">
                        <button
                          type="button"
                          className="review-nav-btn"
                          onClick={() => setReviewIdx((i) => (i <= 0 ? reviews.length - 1 : i - 1))}
                          disabled={reviews.length <= 1}
                          aria-label="Reseña anterior"
                        >
                          ←
                        </button>

                        <div>
                          <div className="review-header">
                            <StarBar value={(r as any)?.rating ?? 0} size={18} />
                            <span className="review-title">{reviewerName}</span>
                            <span className="review-date">
                              {new Date((r as any)?.createdAt ?? Date.now()).toLocaleDateString('es-CO')}
                            </span>
                          </div>

                          {(r as any)?.comment && <div className="review-comment">{(r as any).comment}</div>}

                          <div className="review-counter">
                            {reviewIdx + 1} / {reviews.length}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="review-nav-btn"
                          onClick={() => setReviewIdx((i) => (i >= reviews.length - 1 ? 0 : i + 1))}
                          disabled={reviews.length <= 1}
                          aria-label="Siguiente reseña"
                        >
                          →
                        </button>
                      </div>
                    );
                  })()
                )}
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
                      <p>
                        <strong>Archivos seleccionados:</strong>
                      </p>
                      <ul>
                        {credentialFiles.map((f, i) => (
                          <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                            {f.name}
                            <button
                              type="button"
                              className="remove-credential-btn"
                              onClick={() => setCredentialFiles((prev) => prev.filter((_, idx) => idx !== i))}
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
                    <p>
                      <strong>Credenciales Subidas:</strong>
                    </p>

                    {formData.credentials.length === 0 && <p className="muted">No hay credenciales aún.</p>}

                    <ul className="credentials-list">
                      {formData.credentials.map((url, index) => (
                        <li key={`${url}-${index}`}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {credentialNames[index] || deriveNameFromUrl(url) || `Credencial ${index + 1}`}
                          </a>
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

          <div className="form-actions">
            <div className="main-actions">
              <button type="submit" className="btn btn-primary" disabled={isSaving || isDeleting}>
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={isSaving || isDeleting}>
                Cancelar
              </button>
            </div>

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
                {normalizedUserRoles.length > 1
                  ? `Se eliminará tu rol de ${currentRole === 'student' ? 'estudiante' : 'tutor'}. Si es tu único rol, se eliminará toda la cuenta.`
                  : 'Al ser tu único rol, esta acción eliminará completamente tu cuenta y no se puede deshacer.'}
              </p>
            </div>
          </div>
        </form>

        {showDeleteModal && (
          <div className="modal-overlay" onClick={handleCancelDelete}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>⚠️ Confirmar Eliminación de Rol</h2>
              </div>

              <div className="modal-body">
                <p>
                  <strong>
                    ¿Estás seguro de que deseas eliminar tu rol de{' '}
                    {currentRole === 'student' ? 'estudiante' : 'tutor'}?
                  </strong>
                </p>

                {normalizedUserRoles.length > 1 ? (
                  <>
                    <p>
                      Se eliminará únicamente tu rol de {currentRole === 'student' ? 'estudiante' : 'tutor'},
                      pero mantendrás acceso con tus otros roles.
                    </p>
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
                  {currentRole === 'student' && <li>✗ Tu historial académico y tareas</li>}
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
                <button className="btn btn-danger" onClick={handleConfirmDelete} disabled={isDeleting}>
                  {isDeleting
                    ? 'Eliminando...'
                    : `Sí, Eliminar ${currentRole === 'student' ? 'Rol de Estudiante' : 'Rol de Tutor'}`}
                </button>
                <button className="btn btn-secondary" onClick={handleCancelDelete} disabled={isDeleting}>
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
