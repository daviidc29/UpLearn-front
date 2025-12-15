import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../styles/TutorNav.css';
import DashboardSwitchButton from '../DashboardSwitchButton';
import AddRoleButton from '../AddRoleButton';

type Tab =
    | 'dashboard'
    | 'my-students'
    | 'sessions'
    | 'availability'
    | 'requests'
    | 'available-tasks';

export interface TutorNavProps {
    active: Tab;
    userName: string;
    userEmail?: string;
    onLogout: () => void;
    tokenBalance: number;
    copPerToken?: number;
}

const routeFor = (tab: Tab) => {
    switch (tab) {
        case 'dashboard': return '/tutor-dashboard?tab=dashboard';
        case 'my-students': return '/tutor/students';
        case 'sessions': return '/tutor-classes';
        case 'availability': return '/availability';
        case 'requests': return '/tutor/mis-clases-simple';
        case 'available-tasks': return '/tutor/tasks/available';
    }
};

const tabsInOrder: { key: Tab; icon: string; label: string }[] = [
    { key: 'dashboard', icon: '📊', label: 'Dashboard' },
    { key: 'my-students', icon: '👥', label: 'Mis Estudiantes' },
    { key: 'sessions', icon: '📬', label: 'Solicitudes' },
    { key: 'availability', icon: '🗓️', label: 'Disponibilidad' },
    { key: 'requests', icon: '🎓', label: 'Mis Clases' },
    { key: 'available-tasks', icon: '📋', label: 'Tareas disponibles' },
];

const TutorNav: React.FC<TutorNavProps> = ({
    active,
    userName,
    userEmail,
    onLogout,
    tokenBalance,
    copPerToken = 1700,
}) => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const currentTab = (new URLSearchParams(search).get('tab') as Tab) || active;

    const cop = tokenBalance * copPerToken;
    const copFmt = cop.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    return (
        <header className="tutor-nav">
            <div className="tutor-nav__content">
                <div className="tutor-nav__brand">
                    <h2>UpLearn Tutor</h2>
                </div>

                <nav className="tutor-nav__menu" aria-label="Navegación principal del tutor">
                    {tabsInOrder.map(({ key, icon, label }) => (
                        <button
                            key={key}
                            className={`tutor-nav__item ${currentTab === key ? 'active' : ''}`}
                            onClick={() => navigate(routeFor(key))}
                            type="button"
                        >
                            <span aria-hidden>{icon}</span> {label}
                        </button>
                    ))}
                </nav>

                <div className="tutor-nav__right">
                    <div className="token-chip" title={`${tokenBalance} tokens ≈ ${copFmt}`}>
                        <img src="/coin-icon.png" alt="Moneda" />
                        <span className="amount">{tokenBalance}</span>
                        <span className="label">tokens</span>
                    </div>

                    <div className="user-menu">
                        <details>
                            <summary>
                                <span className="avatar" aria-hidden>👨‍🏫</span>
                                <span className="name">{userName}</span>
                                <span className="chev">▾</span>
                            </summary>
                            <div className="user-menu__panel" role="menu">
                                {userEmail && <div className="user-menu__info">
                                    <div className="email">{userEmail}</div>
                                    <div className="role">Tutor Profesional</div>
                                </div>}
                                <button
                                    className="menu-btn"
                                    onClick={() => navigate('/edit-profile', { state: { currentRole: 'tutor' } })
                                    }
                                    type="button"
                                >
                                    ✏️ Editar Perfil
                                </button>                <AddRoleButton currentRole="tutor" asMenuItem />
                                <DashboardSwitchButton currentRole="tutor" asMenuItem />
                                <button className="menu-btn danger" onClick={onLogout} type="button">🚪 Cerrar Sesión</button>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default TutorNav;
