import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import '../styles/Calendar.css';
import '../styles/StudentDashboard.css';
import {
  getScheduleForTutor,
  getPublicAvailabilityForTutor,
  createReservation,
  type ScheduleCell,
} from '../service/Api-scheduler';
import { AppHeader } from './StudentDashboard'; 
import ApiPaymentService from '../service/Api-payment';
import type { Specialization } from '../types/specialization';

function parseISODateLocal(iso: string): Date {
  // iso = 'YYYY-MM-DD'
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1); 
}
function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function mondayOf(dateIso: string): string {
  const d = parseISODateLocal(dateIso);
  const day = d.getDay(); 
  const diffFromMonday = (day + 6) % 7; 
  d.setDate(d.getDate() - diffFromMonday);
  return toISODateLocal(d);
}
function addDays(iso: string, days: number): string {
  const d = parseISODateLocal(iso);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

/* Estado esperado en la navegación */
interface NavState {
  tutor?: {
    userId?: string;
    sub?: string;
    name?: string;
    email?: string;
    bio?: string;
    specializations?: Specialization[]; // Ahora objetos Specialization
    credentials?: string[];
    tokensPerHour?: number;
  };
  role?: 'tutor' | 'student';
}

type BannerType = 'success' | 'warning' | 'error';
type Banner = { type: BannerType; text: string } | null;
const bannerStyle = (type: BannerType): React.CSSProperties => {
  if (type === 'success') {
    return {
      margin: '12px 0',
      padding: '12px 16px',
      background: '#ECFDF5',
      border: '1px solid #A7F3D0',
      borderRadius: '8px',
      color: '#065F46',
      fontWeight: 500,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    };
  }
  if (type === 'warning') {
    return {
      margin: '12px 0',
      padding: '12px 16px',
      background: '#FFFBEB',
      border: '1px solid #FDE68A',
      borderRadius: '8px',
      color: '#92400E',
      fontWeight: 500,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    };
  }
  return {
    margin: '12px 0',
    padding: '12px 16px',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
    color: '#991B1B',
    fontWeight: 500,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  };
};

const BookTutorPage: React.FC = () => {
  const { tutorId } = useParams<{ tutorId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  // Datos del tutor y rol desde la navegación
  const state = location.state as NavState | undefined;
  const profile = state?.tutor ?? {};
  const role: 'tutor' | 'student' = state?.role ?? 'tutor';

  // Estado local
  const [token, setToken] = useState<string | undefined>();
  const [weekStart, setWeekStart] = useState(() => mondayOf(toISODateLocal(new Date())));
  const [scheduleCells, setScheduleCells] = useState<ScheduleCell[]>([]);
  const [selectedCell, setSelectedCell] = useState<ScheduleCell | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  const [banner, setBanner] = useState<Banner>(null);
  // Verificación de tokens vs tarifa
  const [tokenCheck, setTokenCheck] = useState<{ hasEnoughTokens: boolean; requiredTokens: number; currentBalance: number } | null>(null);
  const [checkingTokens, setCheckingTokens] = useState(false);
  const [tokenCheckError, setTokenCheckError] = useState('');

  // Referencia de tiempo actual para filtrar el pasado
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const currentUser = useMemo(
    () => ({
      userId: auth.user?.profile?.sub || 'unknown',
      name: auth.user?.profile?.name || auth.user?.profile?.nickname || 'Usuario',
      email: auth.user?.profile?.email || 'No email',
      role: 'student' as const,
    }),
    [auth.user]
  );

  // Auth token
  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      const idToken = (auth.user as any)?.id_token as string | undefined;
      const accessToken = auth.user?.access_token as string | undefined;
      setToken(idToken ?? accessToken);
    } else {
      setToken(undefined);
    }
  }, [auth.isAuthenticated, auth.user]);

  // Cargar balance de tokens
  useEffect(() => {
    if (!token) return;
    const loadBalance = async () => {
      try {
        const data = await ApiPaymentService.getStudentBalance(token);
        setTokenBalance(data.tokenBalance);
      } catch (e) {
        console.error('Error cargando balance:', e);
      }
    };
    loadBalance();
  }, [token]);

  // Verificar tokens suficientes para la tarifa del tutor
  useEffect(() => {
    const required = Number((profile as any)?.tokensPerHour);
    if (!token || !required || required <= 0) {
      setTokenCheck(null);
      setTokenCheckError('');
      return; // Sin tarifa definida o gratuita
    }
    let cancelled = false;
    const runCheck = async () => {
      setCheckingTokens(true);
      setTokenCheckError('');
      try {
        const r = await ApiPaymentService.checkStudentTokens(required, token);
        if (!cancelled) {
          setTokenCheck({
            hasEnoughTokens: !!r.hasEnoughTokens,
            requiredTokens: Number(r.requiredTokens),
            currentBalance: Number(r.currentBalance)
          });
        }
      } catch (err: any) {
        if (!cancelled) setTokenCheckError(err?.message || 'Error verificando tokens');
      } finally {
        if (!cancelled) setCheckingTokens(false);
      }
    };
    runCheck();
    return () => { cancelled = true; };
  }, [token, profile]);

  // Identificador efectivo del tutor
  const effectiveTutorId = useMemo(
    () => (profile as any)?.userId || (profile as any)?.sub || tutorId,
    [profile, tutorId]
  );

  useEffect(() => {
    const loadWeek = async () => {
      if (!token || !effectiveTutorId) return;
      setLoading(true);
      setSelectedCell(null);
      setBanner(null);
      try {
        const data = await getScheduleForTutor(effectiveTutorId, weekStart, token);
        setScheduleCells(data);
      } catch {
        const data = await getPublicAvailabilityForTutor(effectiveTutorId, weekStart, token);
        setScheduleCells(data);
      } finally {
        setLoading(false);
      }
    };
    loadWeek();
  }, [token, effectiveTutorId, weekStart]);

  // Confirmar reserva
  const confirmReservation = async () => {
    if (!selectedCell || !token || !effectiveTutorId) return;

    // Evitar reservarse a sí mismo
    const myId = auth.user?.profile?.sub;
    if (myId && effectiveTutorId && myId === effectiveTutorId) {
      setBanner({ type: 'warning', text: 'No te puedes reservar a ti mismo.' });
      return;
    }
    const ok = globalThis.confirm(
      `Confirmar reserva el ${selectedCell.date} a las ${selectedCell.hour}?`
    );
    if (!ok) return;

    // Validar saldo contra tarifa definida
    const required = Number((profile as any)?.tokensPerHour);
    if (required > 0 && tokenCheck && !tokenCheck.hasEnoughTokens) {
      setBanner({ type: 'error', text: `No tienes suficientes tokens (saldo ${tokenCheck.currentBalance}, requiere ${tokenCheck.requiredTokens}). Compra tokens antes de reservar.` });
      return;
    }

    try {
      await createReservation(effectiveTutorId, selectedCell.date, selectedCell.hour, token);
      setBanner({ type: 'success', text: '¡Reserva creada correctamente!' });
      setTimeout(
        () => navigate('/student-dashboard?tab=my-reservations', { replace: true }),
        900
      );
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('tutor no puede ser el mismo') || msg.includes('no puede ser el mismo que el estudiante')) {
        setBanner({ type: 'warning', text: 'No te puedes reservar a ti mismo.' });
      } else {
        setBanner({ type: 'error', text: e?.message || 'Error creando la reserva.' });
      }
    }
  };

  let bannerIcon = '';
  if (banner) {
    if (banner.type === 'success') {
      bannerIcon = '✅';
    } else if (banner.type === 'warning') {
      bannerIcon = '⚠️';
    } else {
      bannerIcon = '❌';
    }
  }

  const handleSectionChange = (section: any) => {
    navigate(`/student-dashboard?tab=${section}`);
  };

  return (
    <div className="dashboard-container">
      <AppHeader currentUser={currentUser} onSectionChange={handleSectionChange} tokenBalance={tokenBalance} />

      <main className="dashboard-main">
        <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
          {banner && (
            <div style={bannerStyle(banner.type)}>
              <span aria-hidden>
                {bannerIcon}
              </span>
              <span>{banner.text}</span>
            </div>
          )}

          <section className="card compact-profile">
            <div className="compact-profile__left">
              <div className="avatar-bubble">👨‍🏫</div>
            </div>
            <div className="compact-profile__body">
              <h2 className="compact-profile__name">{(profile as any).name ?? 'Usuario'}</h2>

              {role === 'student' ? (
                <div className="compact-profile__block">
                  <h4>Información académica</h4>
                  <div>• Nivel educativo: {(profile as any)?.educationLevel ?? '—'}</div>
                </div>
              ) : (
                <>
                  {(profile as any).bio && (
                    <div className="compact-profile__block">
                      <h4>Biografía</h4>
                      <p>{(profile as any).bio}</p>
                    </div>
                  )}
                  <div className="compact-profile__block">
                    <h4>Especializaciones</h4>
                    <div className="tags-container">
                      {(profile as any).specializations?.length
                        ? (profile as any).specializations.map((spec: Specialization, idx: number) => (
                            <span 
                              key={idx} 
                              className={`tag specialization-tag ${spec.verified ? 'verified' : 'manual'}`}
                              title={spec.verified ? `Verificado por IA - ${spec.source}` : 'Agregado manualmente'}
                            >
                              {spec.verified && <span className="verified-icon">✓</span>}
                              {spec.name}
                            </span>
                          ))
                        : '—'}
                    </div>
                  </div>
                  <div className="compact-profile__block">
                    <h4>Credenciales</h4>
                    <div className="tags-container">
                      {(profile as any).credentials?.length
                        ? (profile as any).credentials.map((c: string) => (
                            <span key={c} className="tag">{c}</span>
                          ))
                        : '—'}
                    </div>
                  </div>
                  <div className="compact-profile__block">
                    <h4>Tarifa</h4>
                    <p>{Number((profile as any)?.tokensPerHour) > 0 ? `${(profile as any).tokensPerHour} tokens/hora` : '— (sin definir)'}</p>
                    {Number((profile as any)?.tokensPerHour) > 0 && (
                      <div style={{ fontSize: 13 }}>
                        {checkingTokens && <p>Verificando saldo...</p>}
                        {tokenCheckError && <p style={{ color: '#991B1B' }}>{tokenCheckError}</p>}
                        {tokenCheck && !checkingTokens && (
                          <p>
                            Saldo: <strong>{tokenCheck.currentBalance}</strong> tokens — {tokenCheck.hasEnoughTokens ? '✅ suficiente' : '❌ insuficiente'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card action-strip">
            <div className="action-strip__left">
              {selectedCell
                ? <>Seleccionado: <strong>{selectedCell.date} {selectedCell.hour}</strong></>
                : 'Selecciona una hora disponible'}
            </div>
            <div className="action-strip__right">
              <button className="btn btn-secondary" onClick={() => navigate(-1)}>Volver</button>
              <button className="btn btn-primary" onClick={confirmReservation} disabled={!selectedCell || (Number((profile as any)?.tokensPerHour) > 0 && (tokenCheck ? !tokenCheck.hasEnoughTokens : false))}>
                Confirmar Reserva
              </button>
            </div>
          </section>

          <section className="card week-nav week-nav--highlight">
            <button className="btn btn-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ◀ Semana anterior
            </button>
            <div className="week-nav__title">
              Semana {weekStart} — {addDays(weekStart, 6)}
            </div>
            <button className="btn btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Siguiente semana ▶
            </button>
          </section>

          <section className="calendar-container card" style={{ padding: 12 }}>
            {loading ? (
              <div style={{ padding: 20 }}>Cargando disponibilidad...</div>
            ) : (
              <div className="calendar-grid">
                <div className="col hour-col">
                  <div className="head-cell">Hora</div>
                  {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00').map(h => (
                    <div key={h} className="hour-cell">{h}</div>
                  ))}
                </div>

                {Array.from({ length: 7 }, (_, i) => i).map(i => {
                  const date = addDays(weekStart, i);
                  return (
                    <div key={date} className="col">
                      <div className="head-cell">
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i]}<br />{date.slice(5)}
                      </div>

                      {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00').map(h => {
                        const c = scheduleCells.find(k => k.date === date && k.hour === h);
                        const st = ((c?.status ?? '') as string).toUpperCase();


                        const cellDate = new Date(`${date}T${h}`);
                        const isPast = cellDate < now;

                        const pickable = !isPast && (st === 'DISPONIBLE' || st === 'AVAILABLE');
                        
                        const isSelected = selectedCell?.date === date && selectedCell?.hour === h;
                        const key = `${date}_${h}`;

                        let statusClass = 'disabled';
                        if (!isPast && st) {
                            statusClass = pickable ? 'available' : 'taken';
                        }

                        let ariaLabel = `No disponible ${h} ${date}`;
                        if (pickable) ariaLabel = `Disponible ${h} ${date}`;
                        else if (st) ariaLabel = `Ocupado ${h} ${date}`;

                        return (
                          <button
                            type="button"
                            key={key}
                            className={
                              'cell ' +
                              statusClass +
                              (pickable ? ' can-pick' : '') +
                              (isSelected ? ' selected' : '')
                            }
                            onClick={
                              pickable
                                ? () => {
                                    setSelectedCell({
                                      date,
                                      hour: h,
                                      status: 'DISPONIBLE',
                                      reservationId: null,
                                      studentId: null,
                                    });
                                    setBanner(null);
                                  }
                                : undefined
                            }
                            disabled={!pickable}
                            aria-pressed={isSelected}
                            aria-label={ariaLabel}
                          >
                            {pickable && <span className="cell-label">Disponible</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default BookTutorPage;