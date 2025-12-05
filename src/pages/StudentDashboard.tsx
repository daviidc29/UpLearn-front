import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import "../styles/StudentDashboard.css";

import { useAuthFlow } from "../utils/useAuthFlow";
import { useProfileStatus } from "../utils/useProfileStatus";
import {
  getMyReservations,
  type Reservation as ApiReservation,
} from "../service/Api-scheduler";

import DashboardSwitchButton from "../components/DashboardSwitchButton";
import AddRoleButton from "../components/AddRoleButton";
import ProfileIncompleteNotification from "../components/ProfileIncompleteNotification";
import BuyTokensModal from "../components/BuyTokensModal";
import { studentMenuNavigate, type StudentMenuSection } from "../utils/StudentMenu";
import ApiPaymentService from "../service/Api-payment";

// ---------- Utilidades fecha/hora ----------
function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function todayLocalISO(): string { return toISODateLocal(new Date()); }
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const day = d.getDay(); // 0..6
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toISODateLocal(d);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}
function formatTime(timeStr: string): string {
  const s = (timeStr ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s.slice(0, 5);
}
function isPresentReservation(r: ApiReservation, now: Date = new Date()): boolean {
  const end = new Date(`${r.date}T${formatTime(r.end)}`);
  return end.getTime() >= now.getTime();
}

// ---------- Tipos ----------
export type ActiveSection =
  | "dashboard" | "find-tutors" | "my-tasks" | "post-task" | "my-reservations" | "none";

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
  educationLevel?: string;
}
interface Task {
  id: string;
  title: string;
  description: string;
  subject: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed";
}

// ---------- Header compartido ----------
interface AppHeaderProps {
  currentUser: User | null;
  activeSection?: ActiveSection;
  onSectionChange?: (section: ActiveSection) => void;
  tokenBalance?: number;
  onBuyTokensClick?: () => void;
}
export const AppHeader: React.FC<AppHeaderProps> = ({
  currentUser,
  activeSection = "none",
  onSectionChange = () => {},
  tokenBalance = 0,
  onBuyTokensClick = () => {},
}) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    auth.removeUser();
    const clientId = "342s18a96gl2pbaroorqh316l8";
    const logoutUri = "http://localhost:3000";
    const cognitoDomain = "https://us-east-18mvprkbvu.auth.us-east-1.amazoncognito.com";
    globalThis.location.href =
      `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const handleEditProfile = () => {
    navigate("/edit-profile", { state: { currentRole: "student" } });
  };

  return (
    <header className="dashboard-header">
      <div className="header-content">
        <div className="logo"><h2>UpLearn Student</h2></div>

        <nav className="main-nav">
          <button
            className={`nav-item ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={() => onSectionChange("dashboard")}
            type="button"
          ><span>📊</span> Dashboard</button>

          <button
            className={`nav-item ${activeSection === "find-tutors" ? "active" : ""}`}
            onClick={() => onSectionChange("find-tutors")}
            type="button"
          ><span>🔍</span> Buscar Tutores</button>

          <button
            className={`nav-item ${activeSection === "my-reservations" ? "active" : ""}`}
            onClick={() => onSectionChange("my-reservations")}
            type="button"
          ><span>🗓️</span> Mis Reservas</button>
          <button
            className={`nav-item ${activeSection === "my-tasks" ? "active" : ""}`}
            onClick={() => onSectionChange("my-tasks")}
            type="button"
          ><span>📋</span> Mis Tareas</button>

          <button
            className={`nav-item ${activeSection === "post-task" ? "active" : ""}`}
            onClick={() => onSectionChange("post-task")}
            type="button"
          ><span>➕</span> Publicar Tarea</button>
        </nav>

        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="token-display" onClick={onBuyTokensClick} style={{ cursor: "pointer" }}>
            <img src="/coin-icon.png" alt="Moneda" className="token-icon" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
            <span className="token-amount">{tokenBalance}</span>
            <span className="token-label">tokens</span>
          </div>

          <div className="user-menu-container">
            <button className="user-avatar" onClick={() => setShowUserMenu(!showUserMenu)} type="button">
              <span className="avatar-icon">👤</span>
              <span className="user-name">{currentUser?.name ?? "Usuario"}</span>
              <span className="dropdown-arrow">▼</span>
            </button>
            {showUserMenu && (
              <div className="user-dropdown">
                <div className="user-info">
                  <p className="user-email">{currentUser?.email ?? "No email"}</p>
                  <p className="user-role">
                    Estudiante{currentUser?.educationLevel ? ` - ${currentUser.educationLevel}` : ""}
                  </p>
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleEditProfile} type="button">
                  <span>✏️</span> Editar Perfil
                </button>
                <AddRoleButton currentRole="student" asMenuItem />
                <DashboardSwitchButton currentRole="student" asMenuItem />
                <button className="dropdown-item logout" onClick={handleLogout} type="button">
                  <span>🚪</span> Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// ======================= Página principal (Dashboard) =======================
const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const [token, setToken] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      setToken((auth.user as any)?.id_token ?? auth.user?.access_token);
    } else {
      setToken(undefined);
    }
  }, [auth.isAuthenticated, auth.user]);

  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [showProfileBanner, setShowProfileBanner] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [showBuyTokensModal, setShowBuyTokensModal] = useState(false);

  // Cargar balance de tokens
  useEffect(() => {
    if (!token) return;
    
    const loadTokenBalance = async () => {
      try {
        const balanceData = await ApiPaymentService.getStudentBalance(token);
        setTokenBalance(balanceData.tokenBalance);
      } catch (error) {
        console.error("Error cargando balance de tokens:", error);
        setTokenBalance(0);
      }
    };

    loadTokenBalance();
    
    // Actualizar balance cada 30 segundos
    const interval = setInterval(loadTokenBalance, 30000);
    // Escuchar evento global para refresco inmediato
    const onRefresh = () => { loadTokenBalance(); };
    window.addEventListener('tokens:refresh', onRefresh);
    return () => { clearInterval(interval); window.removeEventListener('tokens:refresh', onRefresh); };
  }, [token]);

  // Lee ?section= para abrir subsecciones directamente
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const sec = q.get("section") as ActiveSection | null;
    if (sec && sec !== activeSection) setActiveSection(sec);
  }, [location.search]); // eslint-disable-line

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

  // Tasks (mock)
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Tarea de Cálculo", description: "Resolver ejercicios de derivadas", subject: "Matemáticas", dueDate: "2025-10-01", priority: "high", status: "pending" },
    { id: "2", title: "Proyecto de Programación", description: "Crear una aplicación web con React", subject: "Programación", dueDate: "2025-10-05", priority: "medium", status: "in_progress" },
  ]);

  // KPIs del tablero
  const [weekStart] = useState(() => mondayOf(todayLocalISO()));
  const [myReservations, setMyReservations] = useState<ApiReservation[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const from = addDays(weekStart, -35);
      const to = addDays(weekStart, 35);
      try {
        const data = await getMyReservations(from, to, token);
        setMyReservations(data);
      } catch {
        setMyReservations([]);
      }
    })();
  }, [token, weekStart]);

  const upcomingCount = useMemo(
    () => myReservations.filter(r => r.status !== "CANCELADO" && isPresentReservation(r)).length,
    [myReservations]
  );
  const tutorsWithRequestsOrReservations = useMemo(() => {
    const s = new Set<string>();
    for (const r of myReservations) if (r.tutorId) s.add(r.tutorId);
    return s.size;
  }, [myReservations]);

  if (auth.isLoading) return <div className="full-center">⏳ Verificando acceso...</div>;
  if (!currentUser) return <div className="full-center">🔍 Cargando información...</div>;

  const onHeaderSectionChange = (section: ActiveSection) => {
    // Rutas externas al dashboard
    if (section === "find-tutors" || section === "my-reservations") {
      studentMenuNavigate(navigate, section as StudentMenuSection);
    }
    if (section === "my-tasks" || section === "post-task" || section === "dashboard") {
      setActiveSection(section);
    }
  };

  return (
    <div className="dashboard-container">
      {!isProfileComplete && missingFields && showProfileBanner && (
        <ProfileIncompleteNotification
          missingFields={missingFields}
          currentRole="student"
          onDismiss={() => setShowProfileBanner(false)}
        />
      )}

      <BuyTokensModal
        isOpen={showBuyTokensModal}
        onClose={() => setShowBuyTokensModal(false)}
        currentBalance={tokenBalance}
        cognitoToken={token}
      />

      <AppHeader 
        currentUser={currentUser} 
        activeSection={activeSection} 
        onSectionChange={onHeaderSectionChange}
        tokenBalance={tokenBalance}
        onBuyTokensClick={() => setShowBuyTokensModal(true)}
      />

      <main className="dashboard-main">
        {activeSection === "dashboard" && (
          <div className="dashboard-content">
            <h1>¡Bienvenido, {currentUser.name}! 👋</h1>

            <div className="stats-grid">
                <button
                  type="button"
                  className="stat-card stat-card--action"
                  onClick={() => setActiveSection("my-tasks")}
                  aria-label="Ir a Mis Tareas"
                >
                  <span className="stat-icon">📚</span>
                  <div className="stat-info">
                    <h3>{tasks.filter(t => t.status === "completed").length}</h3>
                    <p>Tareas Activas</p>
                  </div>
                </button>
              <button
                type="button"
                className="stat-card stat-card--action"
                onClick={() => studentMenuNavigate(navigate, "find-tutors")}
                aria-label="Ir a Mis Reservas"
              >
                <div className="stat-icon">🧑‍🏫</div>
                <div className="stat-info">
                  <h3>{tutorsWithRequestsOrReservations}</h3>
                  <p>Tutores Encontrados</p>
                </div>
              </button>

              <button
                type="button"
                className="stat-card stat-card--action"
                onClick={() => setActiveSection("my-tasks")}
                aria-label="Ir a Mis Tareas"
              >
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <h3>{tasks.filter(t => t.status === "completed").length}</h3>
                  <p>Tareas Completadas</p>
                </div>
              </button>

              <button
                type="button"
                className="stat-card stat-card--action"
                onClick={() => studentMenuNavigate(navigate, "my-reservations")}
                aria-label="Ir a Mis Reservas"
              >
                <div className="stat-icon">🗓️</div>
                <div className="stat-info">
                  <h3>{upcomingCount}</h3>
                  <p>Reservas Próximas</p>
                </div>
              </button>
            </div>

            <div className="recent-activity">
              <h2>Actividad Reciente</h2>
              <div className="activity-list">
                {tasks.length > 0 && (
                  <div className="activity-item">
                    <span className="activity-icon">📝</span>
                    <div className="activity-content">
                      <p><strong>Nueva tarea:</strong> {tasks[0]?.title}</p>
                      <small>Hace 2 horas</small>
                    </div>
                  </div>
                )}
                {myReservations.length > 0 && (
                  <div className="activity-item">
                    <span className="activity-icon">🗓️</span>
                    <div className="activity-content">
                      <p><strong>Reserva:</strong> {myReservations[0].date} a las {formatTime(myReservations[0].start)}</p>
                      <small>Ayer</small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === "my-tasks" && (
          <div className="tasks-section">
            <h1>Mis Tareas 📋</h1>
            <div className="tasks-grid">
              {tasks.map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <h3>{task.title}</h3>
                    <div className="task-meta">
                      <span className="priority-badge" style={{ backgroundColor: ({ high: "#ef4444", medium: "#f59e0b", low: "#10b981" } as any)[task.priority] }}>
                        {task.priority.toUpperCase()}
                      </span>
                      <span className="status-badge" style={{ color: ({ completed: "#10b981", in_progress: "#3b82f6", pending: "#6b7280" } as any)[task.status] }}>
                        {task.status.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <p className="task-description">{task.description}</p>
                  <div className="task-details">
                    <span className="task-subject">📚 {task.subject}</span>
                    <span className="task-due-date">📅 {task.dueDate}</span>
                  </div>
                  <div className="task-actions">
                    <button className="btn-primary" type="button">Ver Detalles</button>
                    <button className="btn-secondary" type="button">Editar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "post-task" && (
          <div className="post-task-section">
            <h1>Publicar Nueva Tarea ➕</h1>
            <TaskForm tasks={tasks} setTasks={setTasks} />
          </div>
        )}
      </main>
    </div>
  );
};

// ---------- Subcomponente: Formulario de tareas ----------
const TaskForm: React.FC<{
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}> = ({ tasks, setTasks }) => {
  const subjects = ["Matemáticas", "Física", "Química", "Programación", "Inglés", "Historia", "Biología"];
  const [newTask, setNewTask] = useState({ title: "", description: "", subject: "", dueDate: "", priority: "medium" as const });

  const handlePostTask = () => {
    if (newTask.title && newTask.description && newTask.subject) {
      const task: any = { id: Date.now().toString(), ...newTask, status: "pending" };
      setTasks(prev => [...prev, task]);
      setNewTask({ title: "", description: "", subject: "", dueDate: "", priority: "medium" });
      alert("Tarea publicada exitosamente!");
    }
  };

  return (
    <div className="task-form-container">
      <div className="task-form">
        <div className="form-group">
          <label htmlFor="task-title">Título</label>
          <input id="task-title" type="text"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            placeholder="Ej: Ayuda con cálculo"
            className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="task-description">Descripción</label>
          <textarea id="task-description"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            placeholder="Describe lo que necesitas..."
            className="form-textarea" rows={4} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="task-subject">Materia</label>
            <select id="task-subject"
              value={newTask.subject}
              onChange={(e) => setNewTask({ ...newTask, subject: e.target.value })}
              className="form-select">
              <option value="">Seleccionar materia</option>
              {subjects.map(subject => (<option key={subject} value={subject}>{subject}</option>))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="task-due-date">Fecha Límite</label>
            <input id="task-due-date" type="date"
              value={newTask.dueDate}
              onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
              className="form-input" />
          </div>
        </div>

        <fieldset className="form-group">
          <legend>Prioridad</legend>
          <div className="priority-options">
            {["low", "medium", "high"].map(priority => (
              <label key={priority} className="priority-option" htmlFor={`priority-${priority}`}>
                <input id={`priority-${priority}`} type="radio" name="priority"
                  value={priority}
                  checked={newTask.priority === priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })} />
                <span className="priority-label">{priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          <button className="btn-primary btn-large" onClick={handlePostTask} type="button">Publicar Tarea</button>
          <button className="btn-secondary" onClick={() => setNewTask({ title: "", description: "", subject: "", dueDate: "", priority: "medium" })} type="button">Limpiar</button>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
