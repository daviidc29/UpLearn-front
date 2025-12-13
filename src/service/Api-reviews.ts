const API_BASE_URL = 'https://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net';

export type TutorReview = {
  id: string;
  tutorId: string;
  studentId: string;
  studentName: string;
  rating: number;
  comment?: string;
  createdAt: string;
};

export type TutorRatingSummary = {
  tutorId: string;
  avg: number;
  count: number;
};

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token && token.trim()) h.Authorization = `Bearer ${token.replace(/^Bearer\s+/i, '')}`;
  return h;
}

export async function getTutorRatingSummary(
  tutorId: string,
  token?: string
): Promise<TutorRatingSummary> {
  const res = await fetch(
    `${API_BASE_URL}/api/reviews/tutor/${encodeURIComponent(tutorId)}/summary`,
    { headers: authHeaders(token), credentials: 'include' }
  );
  if (!res.ok) return { tutorId, avg: 0, count: 0 };
  return res.json();
}

export async function getTutorReviews(
  tutorId: string,
  limit = 20,
  token?: string
): Promise<TutorReview[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/reviews/tutor/${encodeURIComponent(tutorId)}?limit=${limit}`,
    { headers: authHeaders(token), credentials: 'include' }
  );
  if (!res.ok) return [];
  return res.json();
}
