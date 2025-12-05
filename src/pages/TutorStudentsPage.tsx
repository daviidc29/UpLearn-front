import React, { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { getTutorReservations, type Reservation } from '../service/Api-scheduler';
import { ENV } from '../utils/env';
import '../styles/TutorDashboard.css'; 

type PublicProfile = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

type StudentWithHistory = {
  studentId: string;
  profile: PublicProfile;
  reservations: Reservation[];
  sessionsCompleted: number;
  firstSessionDate: string;
  status: 'active' | 'inactive';
};

function formatTime(timeStr?: string): string {
  if (!timeStr) return '';
  const s = timeStr.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s.slice(0, 5);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

const HISTORY_PAGE_SIZE = 5;

interface StudentHistoryProps {
  reservations: Reservation[];
}

const StudentHistory: React.FC<StudentHistoryProps> = ({ reservations }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(reservations.length / HISTORY_PAGE_SIZE));
  const paginatedReservations = reservations.slice(
    (currentPage - 1) * HISTORY_PAGE_SIZE,
    currentPage * HISTORY_PAGE_SIZE
  );

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    let color = '#6b7280';
    if (['FINALIZADA', 'ACEPTADO', 'ACTIVA'].includes(s)) color = '#10b981';
    if (s === 'INCUMPLIDA' || s === 'CANCELADO') color = '#ef4444';
    if (s === 'PENDIENTE') color = '#f59e0b';

    return <span className="history-status-badge" style={{ backgroundColor: `${color}20`, color }}>{s}</span>;
  };

  return (
    <div className="student-history-panel">
      <h4>Historial de Clases</h4>
      {reservations.length > 0 ? (
        <>
          <div className="history-list">
            {paginatedReservations.map(res => (
              <div key={res.id} className="history-item">
                <span className="history-date">
                  📅 {formatDate(res.date)} a las {formatTime(res.start)}
                </span>
                {getStatusBadge(res.status)}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                Anterior
              </button>
              <span>Página {currentPage} de {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Siguiente
              </button>
            </div>
          )}
        </>
      ) : (
        <p>No hay clases en el historial de este estudiante.</p>
      )}
    </div>
  );
};

const TutorStudentsPage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const token = user?.id_token;
  const tutorId = user?.profile.sub;

  const [students, setStudents] = useState<StudentWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const groupReservationsByStudent = (reservations: Reservation[]) => {
    const map: Record<string, Reservation[]> = {};
    for (const res of reservations) {
      if (!map[res.studentId]) map[res.studentId] = [];
      map[res.studentId].push(res);
    }
    return map;
  };

  const fetchProfilesForStudentIds = async (studentIds: string[], token: string) => {
    const profilePromises = studentIds.map(id =>
      fetch(`${ENV.USERS_BASE}${ENV.USERS_PROFILE_PATH}?id=${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`Failed to fetch profile for ${id}`)))
    );
    const profileResults = await Promise.allSettled(profilePromises);
    const profiles: Record<string, PublicProfile> = {};
    profileResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        profiles[studentIds[index]] = result.value;
      }
    });
    return profiles;
  };

  const buildStudentData = (reservationsByStudent: Record<string, Reservation[]>, profiles: Record<string, PublicProfile>) => {
    const studentIds = Object.keys(reservationsByStudent);
    return studentIds.map(id => {
      const studentReservations = reservationsByStudent[id].slice();
      studentReservations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const lastSessionDate = studentReservations.find(r => r.status === 'FINALIZADA')?.date;
      const isActive = !!lastSessionDate && (Date.now() - new Date(lastSessionDate).getTime()) < 30 * 24 * 60 * 60 * 1000;

      return {
        studentId: id,
        profile: profiles[id] || { name: 'Estudiante Desconocido', email: 'N/A' },
        reservations: studentReservations,
        sessionsCompleted: studentReservations.filter(r => r.status === 'FINALIZADA').length,
        firstSessionDate: studentReservations[studentReservations.length - 1]?.date || 'N/A',
        status: isActive ? 'active' : 'inactive',
      } as StudentWithHistory;
    });
  };

  useEffect(() => {
    if (!token || !tutorId) return;

    const fetchStudentData = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = '2020-01-01';
        const to = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
        const reservations = await getTutorReservations(from, to, token);

        const reservationsByStudent = groupReservationsByStudent(reservations);
        const studentIds = Object.keys(reservationsByStudent);

        if (studentIds.length === 0) {
          setStudents([]);
          return;
        }

        const profiles = await fetchProfilesForStudentIds(studentIds, token);
        const studentData = buildStudentData(reservationsByStudent, profiles);

        studentData.sort((a, b) => {
          if (a.status === b.status) return a.profile.name!.localeCompare(b.profile.name!);
          return a.status === 'active' ? -1 : 1;
        });

        setStudents(studentData);
      } catch (err: any) {
        setError(err.message || 'No se pudo cargar la información de los estudiantes.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [token, tutorId]);

  const toggleHistory = (studentId: string) => {
    setExpandedStudentId(prevId => (prevId === studentId ? null : studentId));
  };
  
  if (loading || authLoading) {
    return <div className="full-center">Cargando tus estudiantes...</div>;
  }
  
  if (error) {
    return <div className="full-center error-message">{error}</div>;
  }

  return (
    <div className="students-section">
      <h1>Mis Estudiantes 👥</h1>
      
      <div className="students-grid">
        {students.length === 0 && !loading && (
            <p>Aún no tienes estudiantes en tu historial.</p>
        )}
        {students.map(student => (
          <div key={student.studentId} className="student-card-container">
            <div className="student-card">
              <div className="student-header">
                <div className="student-avatar" style={{backgroundColor: student.profile.avatarUrl ? 'transparent' : '#667eea'}}>
                  {student.profile.avatarUrl 
                    ? <img src={student.profile.avatarUrl} alt={student.profile.name} /> 
                    : <span>{(student.profile.name || 'E').charAt(0)}</span>
                  }
                </div>
                <div className="student-info">
                  <h3>{student.profile.name}</h3>
                  <p className="student-email">{student.profile.email}</p>
                  <span className={`status-badge-student ${student.status}`}>
                    {student.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              <div className="student-details">
                <p><strong>Nivel:</strong> Pregrado</p>
                <p><strong>Se unió:</strong> {formatDate(student.firstSessionDate)}</p>
                <p><strong>Sesiones completadas:</strong> {student.sessionsCompleted}</p>
              </div>

              <div className="student-actions">
                <button className="btn-secondary" onClick={() => toggleHistory(student.studentId)}>
                  {expandedStudentId === student.studentId ? 'Ocultar Historial' : 'Ver Historial'}
                </button>
              </div>
            </div>
            
            {expandedStudentId === student.studentId && (
              <StudentHistory reservations={student.reservations} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TutorStudentsPage;