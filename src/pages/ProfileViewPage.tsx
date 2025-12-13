import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import '../styles/EditProfilePage.css';
import type { Specialization } from '../types/specialization';
import { getTutorRatingSummary, getTutorReviews, type TutorReview } from '../service/Api-reviews';

type RoleView = 'student' | 'tutor';

interface ProfileState {
  profile?: {
    userId?: string;
    sub?: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
    idType?: string;
    idNumber?: string;
    // student
    educationLevel?: string;
    // tutor
    bio?: string;
    specializations?: Specialization[];
    credentials?: string[];
    tokensPerHour?: number; // Tarifa en tokens por hora
  };
}

const StarBar: React.FC<{ value: number; size?: number }> = ({ value, size = 18 }) => {
  const full = Math.floor(value);
  const half = value - full >= 0.25 && value - full < 0.75;
  const arr = Array.from({ length: 5 }, (_, i) => (i < full ? 'full' : i === full && half ? 'half' : 'empty'));
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {arr.map((k, i) => (
        <span key={i} aria-hidden style={{ fontSize: size, lineHeight: 1 }}>
          {k === 'full' ? '★' : k === 'half' ? '☆' : '✩'}
        </span>
      ))}
    </span>
  );
};

const ProfileViewPage: React.FC = () => {
  const { role } = useParams<{ role: RoleView }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const token = (auth.user as any)?.id_token ?? auth.user?.access_token ?? '';

  const state = location.state as ProfileState | undefined;
  const profile = useMemo(() => state?.profile ?? {}, [state]);

  const effectiveRole: RoleView = role === 'student' || role === 'tutor' ? role : 'tutor';

  const fullName = profile.name ?? auth.user?.profile?.name ?? 'Usuario';
  const email = profile.email ?? auth.user?.profile?.email ?? '';

  const tutorEffectiveId = (profile.userId || profile.sub || '').trim();
  const canReserve = effectiveRole === 'tutor' && !!tutorEffectiveId;

  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [reviews, setReviews] = useState<TutorReview[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (effectiveRole !== 'tutor') return;
    const id = tutorEffectiveId;
    if (!id) return;

    let cancelled = false;
    (async () => {
      try {
        const [sum, list] = await Promise.all([
          getTutorRatingSummary(id, token),   
          getTutorReviews(id, 50, token),     
        ]);
        if (!cancelled) {
          setRatingAvg(sum?.avg ?? 0);
          setRatingCount(sum?.count ?? 0);
          setReviews(Array.isArray(list) ? list : []);
          setCurrentIdx(0);
        }
      } catch {
        if (!cancelled) {
          setRatingAvg(0); setRatingCount(0); setReviews([]);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [effectiveRole, tutorEffectiveId, token]);
  const handleBack = () => navigate(-1);

  const handleReserve = () => {
    const id = tutorEffectiveId;
    if (!id) {
      alert('No se pudo identificar al tutor para reservar.');
      return;
    }
    navigate(`/book/${encodeURIComponent(id)}`, { state: { tutor: profile, role: 'tutor' } });
  };

  return (
    <div className="edit-profile-container">
      <div className="edit-profile-content">
        <div className="profile-header">
          <h1>Perfil</h1>
          <p>Información del usuario</p>
          <div className="user-role-badge">
            {effectiveRole === 'student' ? '🎓 Estudiante' : '👨‍🏫 Tutor'}
          </div>
        </div>

        <div className="profile-top-strip" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            aria-hidden
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 20
            }}
            title={fullName}
          >
            {(fullName || 'U').trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{fullName}</div>
            {email && <div style={{ fontSize: 12, color: '#6B7280' }}>{email}</div>}
          </div>
        </div>

        <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-section">
            <h2>Información Personal</h2>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="fullName">Nombre Completo</label>
                <input id="fullName" className="form-input" value={fullName} disabled readOnly />
              </div>
            </div>
          </div>

          {effectiveRole === 'student' && (
            <div className="form-section">
              <h2>Información Académica</h2>
              <div className="form-group">
                <label className="form-label" htmlFor="educationLevel">Nivel Educativo</label>
                <input
                  id="educationLevel"
                  className="form-input"
                  value={(profile as any).educationLevel ?? '—'}
                  disabled
                  readOnly
                />
              </div>
            </div>
          )}

          {effectiveRole === 'tutor' && (
            <div className="form-section">
              <h2>Información Profesional</h2>

              {/* Bloque de calificación promedio */}
              <div className="form-group">
                <label className="form-label">Recomendación</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StarBar value={ratingAvg} />
                  <span style={{ color: '#6B7280' }}>
                    {ratingCount > 0
                      ? `${ratingAvg.toFixed(1)} · ${ratingCount} reseña${ratingCount > 1 ? 's' : ''}`
                      : 'Aún sin reseñas'}
                  </span>
                </div>
              </div>

              {!!(profile as any).bio && (
                <div className="form-group">
                  <label className="form-label" htmlFor="bio">Biografía</label>
                  <textarea id="bio" className="form-input form-textarea" value={(profile as any).bio} disabled readOnly rows={4} />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="specializations" className="form-label">Especializaciones</label>
                <div className="tags-container">
                  {Array.isArray((profile as any).specializations) && (profile as any).specializations.length > 0 ? (
                    <>
                      {(profile as any).specializations.map((spec: Specialization, idx: number) => (
                        <span
                          key={idx}
                          className={`tag specialization-tag ${spec.verified ? 'verified' : 'manual'}`}
                          title={spec.verified ? `Verificado por IA - ${spec.source}` : 'Agregado manualmente'}
                        >
                          {spec.verified && <span className="verified-icon">✓</span>}
                          {spec.name}
                        </span>
                      ))}
                      <input id="specializations" className="form-input" value={(profile as any).specializations.map((s: Specialization) => s.name).join(', ')} readOnly aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', left: '-10000px' }} />
                    </>
                  ) : (
                    <input id="specializations" className="form-input" value="—" disabled readOnly />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="credentials" className="form-label">Credenciales</label>
                <div className="tags-container">
                  {Array.isArray((profile as any).credentials) && (profile as any).credentials.length > 0 ? (
                    <>
                      {(profile as any).credentials.map((c: string) => (
                        <span key={c} className="tag">{c}</span>
                      ))}
                      <input id="credentials" className="form-input" value={(profile as any).credentials.join(', ')} readOnly aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', left: '-10000px' }} />
                    </>
                  ) : (
                    <input id="credentials" className="form-input" value="—" disabled readOnly />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="tokensPerHour">Tarifa (Tokens por Hora)</label>
                <input
                  id="tokensPerHour"
                  className="form-input"
                  value={typeof (profile as any).tokensPerHour === 'number' && (profile as any).tokensPerHour > 0 ? `${(profile as any).tokensPerHour} tokens/hora` : '—'}
                  readOnly
                  disabled
                />
              </div>

              {/* Carrusel de reseñas (si existen) */}
              {reviews.length > 0 && (
                <div className="form-section">
                  <h2>Reseñas de estudiantes</h2>
                  <div
                    style={{
                      border: '1px solid #E5E7EB',
                      background: '#fff',
                      borderRadius: 12,
                      padding: 16,
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentIdx((i) => (i <= 0 ? reviews.length - 1 : i - 1))}
                      aria-label="Reseña anterior"
                    >
                      ←
                    </button>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StarBar value={reviews[currentIdx].rating} />
                        <strong>{reviews[currentIdx].studentName || 'Usuario'}</strong>
                        <small style={{ color: '#6B7280' }}>
                          {new Date(reviews[currentIdx].createdAt).toLocaleDateString('es-CO')}
                        </small>
                      </div>
                      {reviews[currentIdx].comment && (
                        <p style={{ marginTop: 8, color: '#374151' }}>{reviews[currentIdx].comment}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentIdx((i) => (i >= reviews.length - 1 ? 0 : i + 1))}
                      aria-label="Siguiente reseña"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
            <div className="main-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canReserve && (
                <button type="button" className="btn btn-primary" onClick={handleReserve}>
                  Reservar Cita
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={handleBack}>
                Volver
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileViewPage;
