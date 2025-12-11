import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

import '../styles/StudentDashboard.css';
import '../styles/TasksPage.css';

import { useAuthFlow } from '../utils/useAuthFlow';
import { useProfileStatus } from '../utils/useProfileStatus';
import ProfileIncompleteNotification from '../components/ProfileIncompleteNotification';
import { AppHeader, type ActiveSection } from './StudentDashboard';
import { studentMenuNavigate } from '../utils/StudentMenu';
import { postTask } from '../service/Api-tasks';

interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface FormState {
  titulo: string;
  descripcion: string;
  materia: string;
  fechaLimite: string;
}

const defaultForm: FormState = {
  titulo: '',
  descripcion: '',
  materia: '',
  fechaLimite: '',
};

const StudentPostTaskPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { userRoles, isAuthenticated, needsRoleSelection } = useAuthFlow();
  const { isProfileComplete, missingFields } = useProfileStatus();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileBanner, setShowProfileBanner] = useState(true);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isAuthenticated === null || userRoles === null) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    if (needsRoleSelection) { navigate('/role-selection'); return; }
    if (!userRoles?.includes('student')) { navigate('/'); return; }
    if (auth.user) {
      setCurrentUser({
        userId: auth.user.profile?.sub || 'unknown',
        name: auth.user.profile?.name || auth.user.profile?.nickname || 'Usuario',
        email: auth.user.profile?.email || 'No email',
        role: 'student',
      });
    }
  }, [isAuthenticated, userRoles, needsRoleSelection, navigate, auth.user]);

  const onHeaderSectionChange = (section: ActiveSection) => {
    studentMenuNavigate(navigate, section as any);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!form.titulo || !form.descripcion || !form.materia) {
      setError('Completa título, descripción y materia.');
      return;
    }
    const token = (auth.user as any)?.id_token ?? auth.user?.access_token;
    if (!token) { setError('No hay sesión activa.'); return; }
    try {
      setSubmitting(true);
      await postTask({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        materia: form.materia.trim(),
        fechaLimite: form.fechaLimite || undefined,
      }, token);
      setSuccessMsg('Tarea publicada correctamente. Puedes verla en "Mis tareas".');
      setForm(defaultForm);
    } catch (err: any) {
      setError(err?.message || 'No se pudo publicar la tarea.');
    } finally {
      setSubmitting(false);
    }
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
        activeSection={"post-task"}
        onSectionChange={onHeaderSectionChange}
      />

      <main className="dashboard-main">
        <div className="tasks-section">
          <h1>Publicar nueva tarea ➕</h1>

          <form className="task-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="titulo">Título</label>
              <input
                id="titulo"
                className="form-input"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ej: Ayuda con Cálculo Diferencial"
              />
            </div>

            <div className="form-group">
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion"
                className="form-textarea"
                rows={4}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Describe lo que necesitas."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="materia">Materia</label>
                <input
                  id="materia"
                  className="form-input"
                  value={form.materia}
                  onChange={(e) => setForm({ ...form, materia: e.target.value })}
                  placeholder="Matemáticas, Física, Inglés..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="fechaLimite">Fecha límite (opcional)</label>
                <input
                  id="fechaLimite"
                  type="date"
                  className="form-input"
                  value={form.fechaLimite}
                  onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
                />
              </div>
            </div>

            {error && <p className="error-text">{error}</p>}
            {successMsg && <p className="success-text">{successMsg}</p>}

            <div className="form-actions">
              <button className="btn-primary btn-large" type="submit" disabled={submitting}>
                {submitting ? 'Publicando...' : 'Publicar tarea'}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => { setForm(defaultForm); setError(''); setSuccessMsg(''); }}
                disabled={submitting}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default StudentPostTaskPage;
