import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import '../styles/EditProfilePage.css';
import type { Specialization } from '../types/specialization';
import {
  getTutorReviews,
  getTutorRatingSummary,
  type CallReview,
  type TutorRatingSummary,
} from '../service/Api-call';

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
    specializations?: Specialization[]; // Ahora objetos Specialization
    credentials?: string[];
    // Tarifa en tokens por hora (tutor)
    tokensPerHour?: number;
  };
}

const ProfileViewPage: React.FC = () => {
  const { role } = useParams<{ role: RoleView }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const state = location.state as ProfileState | undefined;
  const profile = useMemo(() => state?.profile ?? {}, [state]);

  const effectiveRole: RoleView = role === 'student' || role === 'tutor' ? role : 'tutor';

  const fullName = profile.name ?? auth.user?.profile?.name ?? 'Usuario';
  const email = profile.email ?? auth.user?.profile?.email ?? '';

  const token = useMemo(
    () => (auth.user as any)?.id_token || auth.user?.access_token || '',
    [auth.user]
  );

  const [reviews, setReviews] = useState<CallReview[]>([]);
  const [ratingSummary, setRatingSummary] = useState<TutorRatingSummary | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [errorReviews, setErrorReviews] = useState<string | null>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // helpers para la reseña actual
  const hasReviews = reviews.length > 0;
  const currentReview: CallReview | null = hasReviews ? reviews[currentReviewIndex] : null;
  const trimmedCurrentComment: string =
    currentReview?.comment?.trim() && currentReview.comment.trim().length > 0
      ? currentReview.comment.trim()
      : '';

  // Puede reservar si está viendo un PERFIL DE TUTOR y hay algún id
  const tutorEffectiveId = (profile.userId || profile.sub || '').trim();
  const canReserve = effectiveRole === 'tutor' && !!tutorEffectiveId;

  const handleBack = () => navigate(-1);

  const handleReserve = () => {
    const id = tutorEffectiveId;
    if (!id) {
      alert('No se pudo identificar al tutor para reservar.');
      return;
    }
    navigate(`/book/${encodeURIComponent(id)}`, { state: { tutor: profile, role: 'tutor' } });
  };

  useEffect(() => {
    if (effectiveRole !== 'tutor') return;
    if (!tutorEffectiveId || !token) return;

    let cancelled = false;
    setLoadingReviews(true);
    setErrorReviews(null);

    (async () => {
      try {
        const [summary, list] = await Promise.all([
          getTutorRatingSummary(tutorEffectiveId).catch(() => null),
          getTutorReviews(tutorEffectiveId).catch(() => []),
        ]);

        if (cancelled) return;

        if (summary && summary.totalReviews > 0) {
          setRatingSummary(summary);
        } else {
          setRatingSummary(null);
        }

        setReviews(list || []);
        setCurrentReviewIndex(0);
      } catch (e) {
        if (!cancelled) {
          console.error('[PROFILE] Error cargando reseñas', e);
          setErrorReviews('No se pudieron cargar las reseñas.');
        }
      } finally {
        if (!cancelled) setLoadingReviews(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveRole, tutorEffectiveId, token]);

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

        <div
          className="profile-top-strip"
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
        >
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
              fontSize: 20,
            }}
            title={fullName}
          >
            {fullName.trim().charAt(0).toUpperCase()}
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
                <label className="form-label" htmlFor="fullName">
                  Nombre Completo
                </label>
                <input id="fullName" className="form-input" value={fullName} disabled readOnly />
              </div>
            </div>
          </div>

          {effectiveRole === 'student' && (
            <div className="form-section">
              <h2>Información Académica</h2>
              <div className="form-group">
                <label className="form-label" htmlFor="educationLevel">
                  Nivel Educativo
                </label>
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

              {!!(profile as any).bio && (
                <div className="form-group">
                  <label className="form-label" htmlFor="bio">
                    Biografía
                  </label>
                  <textarea
                    id="bio"
                    className="form-input form-textarea"
                    value={(profile as any).bio}
                    disabled
                    readOnly
                    rows={4}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="specializations" className="form-label">
                  Especializaciones
                </label>
                <div className="tags-container">
                  {Array.isArray((profile as any).specializations) &&
                  (profile as any).specializations.length > 0 ? (
                    <>
                      {(profile as any).specializations.map((spec: Specialization) => (
                        <span
                          key={spec.name}
                          className={`tag specialization-tag ${
                            spec.verified ? 'verified' : 'manual'
                          }`}
                          title={
                            spec.verified
                              ? `Verificado por IA - ${spec.source}`
                              : 'Agregado manualmente'
                          }
                        >
                          {spec.verified && <span className="verified-icon">✓</span>}
                          {spec.name}
                        </span>
                      ))}
                      <input
                        id="specializations"
                        className="form-input"
                        value={(profile as any).specializations
                          .map((s: Specialization) => s.name)
                          .join(', ')}
                        readOnly
                        aria-hidden="true"
                        tabIndex={-1}
                        style={{ position: 'absolute', left: '-10000px' }}
                      />
                    </>
                  ) : (
                    <input id="specializations" className="form-input" value="—" disabled readOnly />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="credentials" className="form-label">
                  Credenciales
                </label>
                <div className="tags-container">
                  {Array.isArray((profile as any).credentials) &&
                  (profile as any).credentials.length > 0 ? (
                    <>
                      {(profile as any).credentials.map((c: string) => (
                        <span key={c} className="tag">
                          {c}
                        </span>
                      ))}
                      <input
                        id="credentials"
                        className="form-input"
                        value={(profile as any).credentials.join(', ')}
                        readOnly
                        aria-hidden="true"
                        tabIndex={-1}
                        style={{ position: 'absolute', left: '-10000px' }}
                      />
                    </>
                  ) : (
                    <input id="credentials" className="form-input" value="—" disabled readOnly />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="tokensPerHour">
                  Tarifa (Tokens por Hora)
                </label>
                <input
                  id="tokensPerHour"
                  className="form-input"
                  value={
                    typeof (profile as any).tokensPerHour === 'number' &&
                    (profile as any).tokensPerHour > 0
                      ? `${(profile as any).tokensPerHour} tokens/hora`
                      : '—'
                  }
                  readOnly
                  disabled
                />
              </div>
            </div>
          )}

          {effectiveRole === 'tutor' && (
            <div className="form-section">
              <h2>Reseñas de estudiantes</h2>

              {loadingReviews && <p>Cargando reseñas…</p>}
              {errorReviews && <p className="error-message">{errorReviews}</p>}

              {ratingSummary && (
                <div className="tutor-rating-summary">
                  <StarRatingReadOnly value={ratingSummary.averageRating} />
                  <span className="rating-text">
                    {ratingSummary.averageRating.toFixed(1)} / 5 ·{' '}
                    {ratingSummary.totalReviews}{' '}
                    {ratingSummary.totalReviews === 1 ? 'reseña' : 'reseñas'}
                  </span>
                </div>
              )}

              {/* Carrusel solo si hay reseñas */}
              {hasReviews && currentReview && (
                <div className="reviews-carousel">
                  <div className="review-card">
                    <StarRatingReadOnly value={currentReview.rating} />
                    <p className="review-card-comment">
                      {trimmedCurrentComment
                        ? `“${trimmedCurrentComment}”`
                        : 'El estudiante no dejó comentario.'}
                    </p>
                    <div className="review-card-meta">
                      <span>Estudiante</span>
                      <span>
                        {new Date(currentReview.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {reviews.length > 1 && (
                    <div className="review-carousel-controls">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentReviewIndex((prev) =>
                            prev === 0 ? reviews.length - 1 : prev - 1
                          )
                        }
                      >
                        ◀
                      </button>
                      <div className="review-carousel-dots">
                        {reviews.map((review, idx) => (
                          <span
                            key={review.createdAt + '-' + idx}
                            className={
                              'review-carousel-dot' +
                              (idx === currentReviewIndex ? ' active' : '')
                            }
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentReviewIndex((prev) =>
                            prev === reviews.length - 1 ? 0 : prev + 1
                          )
                        }
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
            <div
              className="main-actions"
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              {canReserve && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleReserve}
                >
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

function StarRatingReadOnly({ value }: Readonly<{ value: number }>) {
  const rounded = Math.round(value * 2) / 2;
  const full = Math.floor(rounded);
  const hasHalf = rounded - full >= 0.5;

  return (
    <div className="rating-stars" aria-label={`Valoración media ${value.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }, (_, idx) => {
        const starIndex = idx + 1;
        let symbol = '☆';
        let className = 'star-empty';

        if (starIndex <= full) {
          symbol = '★';
          className = 'star-filled';
        } else if (starIndex === full + 1 && hasHalf) {
          symbol = '★';
          className = 'star-half';
        }

        return (
          <span key={starIndex} className={className}>
            {symbol}
          </span>
        );
      })}
    </div>
  );
}

export default ProfileViewPage;

