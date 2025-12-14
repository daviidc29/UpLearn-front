
export type PublicUserProfile = {
  userId?: string;
  sub?: string;
  name?: string;
  email?: string;
};

const pickBaseUrl = () => {
  const env: any = (import.meta as any)?.env ?? {};
  return (
    env.VITE_USER_API_BASE_URL ||
    env.VITE_API_USER_BASE_URL ||
    env.VITE_API_BASE_URL ||
    ''
  );
};

const BASE_URL = pickBaseUrl();

export async function getPublicProfile(
  params: { id?: string; sub?: string },
  token?: string
): Promise<PublicUserProfile> {
  const qs = new URLSearchParams();
  if (params.sub) qs.set('sub', params.sub);
  if (params.id) qs.set('id', params.id);

  const url = `${BASE_URL}/Api-user/public/profile?${qs.toString()}`;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Public profile failed: ${res.status} ${txt}`.trim());
  }

  return (await res.json()) as PublicUserProfile;
}
