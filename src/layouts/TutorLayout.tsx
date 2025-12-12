import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import TutorNav, { type TutorNavProps } from '../components/tutor/TutorNav';
import ApiPaymentService from '../service/Api-payment';

type Tab = TutorNavProps['active'];

export interface TutorLayoutProps extends PropsWithChildren {
  active: Tab;
}

const COP_PER_TOKEN = 1700;

const TutorLayout: React.FC<TutorLayoutProps> = ({ active, children }) => {
  const auth = useAuth();
  const token = useMemo(() => (auth.user as any)?.id_token ?? auth.user?.access_token, [auth.user]);

  const [tokenBalance, setTokenBalance] = useState<number>(0);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const data = await ApiPaymentService.getTutorBalance(token);
        setTokenBalance(data.tokenBalance ?? 0);
      } catch {
        setTokenBalance(0);
      }
    };
    load();
    const i = setInterval(load, 30_000);
    const onRefresh = () => load();
    globalThis.addEventListener('tokens:refresh', onRefresh);
    return () => { clearInterval(i); globalThis.removeEventListener('tokens:refresh', onRefresh); };
  }, [token]);

  const handleLogout = () => {
    auth.removeUser();
    const clientId = '342s18a96gl2pbaroorqh316l8';
    const logoutUri = 'https://nice-mud-05a4c8f10.3.azurestaticapps.net';
    const cognitoDomain = 'https://us-east-18mvprkbvu.auth.us-east-1.amazoncognito.com';
    globalThis.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const name = auth.user?.profile?.name || auth.user?.profile?.nickname || 'Tutor';
  const email = auth.user?.profile?.email || undefined;

  return (
    <div className="tutor-dashboard-container">
      <TutorNav
        active={active}
        userName={name}
        userEmail={email}
        onLogout={handleLogout}
        tokenBalance={tokenBalance}
        copPerToken={COP_PER_TOKEN}
      />
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  );
};

export default TutorLayout;
