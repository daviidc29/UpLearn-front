import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import "../styles/StudentDashboard.css";
import "../styles/Calendar.css";

import { useAuthFlow } from "../utils/useAuthFlow";
import { useProfileStatus } from "../utils/useProfileStatus";
import ApiSearchService from "../service/Api-search";
import ProfileIncompleteNotification from "../components/ProfileIncompleteNotification";
import { AppHeader, type ActiveSection } from "./StudentDashboard";
import { studentMenuNavigate } from "../utils/StudentMenu";
import ApiPaymentService from "../service/Api-payment";
import type { Specialization } from "../types/specialization";

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
  educationLevel?: string;
}
interface TutorCard {
  userId: string;
  name: string;
  email: string;
  bio?: string;
  specializations?: Specialization[]; // Ahora objetos Specialization
  credentials?: string[];
  rating?: number;
  // Tarifa en tokens por hora definida por el tutor
  tokensPerHour?: number;
}

const StudentFindsTutorsPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tutors, setTutors] = useState<TutorCard[]>([]);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  const [errorSearch, setErrorSearch] = useState<string>("");
  const [showProfileBanner, setShowProfileBanner] = useState(true);
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  useEffect(() => {
    if (isAuthenticated === null || userRoles === null) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (needsRoleSelection) { navigate("/role-selection"); return; }
    if (!userRoles?.includes("student")) { navigate("/"); return; }
    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || "unknown",
        name: auth.user.profile?.name || auth.user.profile?.nickname || "Usuario",
        email: auth.user.profile?.email || "No email",
        role: "student",
      });
    }
  }, [isAuthenticated, userRoles, needsRoleSelection, navigate, auth.user]);

  // Cargar balance de tokens
  useEffect(() => {
    const token = (auth.user as any)?.id_token ?? auth.user?.access_token;
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
  }, [auth.user]);

  // Cargar los 10 mejores tutores al iniciar
  useEffect(() => {
    const loadTopTutors = async () => {
      setLoadingSearch(true);
      try {
        const result = await ApiSearchService.getTopTutors();
        setTutors(result || []);
      } catch (err: any) {
        console.error('Error cargando mejores tutores:', err);
        setErrorSearch('No se pudieron cargar los tutores recomendados');
      } finally {
        setLoadingSearch(false);
      }
    };
    loadTopTutors();
  }, []);

  const handleSearchTutors = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoadingSearch(true);
    setErrorSearch("");
    try {
      const result = await ApiSearchService.searchTutors(searchQuery);
      setTutors(result || []);
      sessionStorage.setItem("u-learn:lastTutorSearchCount", String(result?.length ?? 0));
    } catch (err: any) {
      setErrorSearch(err?.message || "Error en la búsqueda");
    } finally {
      setLoadingSearch(false);
    }
  };

  const onHeaderSectionChange = (section: ActiveSection) => {
    // delegar en navegación central
    studentMenuNavigate(navigate, section as any);
  };

  if (auth.isLoading || !currentUser) {
    return <div className="full-center">Cargando...</div>;
  }

  return (
    <div className="dashboard-container">

      {!isProfileComplete && missingFields && showProfileBanner && (
        <ProfileIncompleteNotification
          currentRole="student"
          missingFields={missingFields}
          onDismiss={() => setShowProfileBanner(false)}
        />
      )}

      <AppHeader
        currentUser={currentUser}
        activeSection={"find-tutors"}
        onSectionChange={onHeaderSectionChange}
        tokenBalance={tokenBalance}
      />

      <main className="dashboard-main">
        <div className="tutors-section">
          <h1>Buscar Tutores 🔍</h1>

          <section className="tutor-search">
            <form onSubmit={handleSearchTutors} className="tutor-search-form">
              <input
                type="text"
                placeholder="Ej: java, cálculo, María..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" disabled={loadingSearch}>
                {loadingSearch ? "Buscando..." : "Buscar"}
              </button>
            </form>

            {errorSearch && <p className="error">{errorSearch}</p>}

            <div className="tutor-results">
              {tutors.length === 0 && !loadingSearch && (
                <p>No hay tutores disponibles en este momento.</p>
              )}

              {tutors.map((tutor) => (
                <div key={tutor.userId} className="tutor-card">
                  <div className="tutor-card-header">
                    <div className="tutor-title">
                      <strong className="tutor-name">{tutor.name}</strong><br />
                      <span className="tutor-email">{tutor.email}</span>
                    </div>
                  </div>

                  {tutor.bio && <p className="tutor-bio">{tutor.bio}</p>}

                  {tutor.specializations && tutor.specializations.length > 0 && (
                    <div className="tutor-tags">
                      {tutor.specializations.map((spec, idx) => (
                        <span 
                          key={idx} 
                          className={`tag specialization-tag ${spec.verified ? 'verified' : 'manual'}`}
                          title={spec.verified ? `Verificado por IA - ${spec.source}` : 'Agregado manualmente'}
                        >
                          {spec.verified && <span className="verified-icon">✓</span>}
                          {spec.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {typeof tutor.tokensPerHour === 'number' && tutor.tokensPerHour > 0 && (
                    <p className="tutor-rate"><strong>Tarifa:</strong> {tutor.tokensPerHour} tokens/hora</p>
                  )}

                  <div className="tutor-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => navigate(`/profile/tutor/${tutor.userId}`, { state: { profile: tutor } })}
                      type="button"
                    >
                      Ver Perfil
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => navigate(`/book/${tutor.userId}`, { state: { tutor, role: "tutor" } })}
                      type="button"
                    >
                      Reservar Cita
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default StudentFindsTutorsPage;
