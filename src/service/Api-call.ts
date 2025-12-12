const API_BASE_URL = 'https://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net';


async function authFetch(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
}


export async function createCallSession(reservationId: string, token: string) {
  const res = await authFetch('/api/calls/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reservationId }),
  }, token);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error ${res.status}: ${text || 'No se pudo crear la sesión'}`);
  }

  return res.json() as Promise<{
    sessionId: string;
    reservationId: string;
    ttlSeconds: number;
  }>;
}

export async function getIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch(`${API_BASE_URL}/api/calls/ice-servers`);
  if (!res.ok) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  const txt = await res.text();
  try {
    const json = JSON.parse(txt);
    return Array.isArray(json) ? (json as RTCIceServer[]) : [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

export type CallMetrics = {
  p95_ms: number;
  p99_ms: number;
  successRate5m: number;
  samples: number;
};

export async function getCallMetrics(): Promise<CallMetrics> {
  const res = await fetch(`${API_BASE_URL}/api/calls/metrics`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status} al obtener métricas`);
  }
  return res.json() as Promise<CallMetrics>;
}


export type CallReview = {
  id: string;
  reservationId: string;
  tutorId: string;
  studentId: string;
  rating: number;
  comment?: string | null;
  createdAt: number;
};

export type TutorRatingSummary = {
  tutorId: string;
  averageRating: number;
  totalReviews: number;
};

export async function submitCallReview(
  token: string,
  data: { reservationId: string; tutorId: string; rating: number; comment?: string }
): Promise<CallReview> {
  const res = await authFetch('/api/calls/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }, token);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error ${res.status} al guardar reseña: ${text || 'error desconocido'}`);
  }
  return res.json() as Promise<CallReview>;
}

export async function getReviewForReservation(
  reservationId: string,
  token: string
): Promise<CallReview | null> {
  const res = await authFetch(
    `/api/calls/reviews/by-reservation/${encodeURIComponent(reservationId)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    token
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error ${res.status} al cargar reseña: ${text || 'error desconocido'}`);
  }
  return res.json() as Promise<CallReview>;
}

export async function getTutorReviews(
  tutorId: string,
  token: string
): Promise<CallReview[]> {
  const res = await authFetch(
    `/api/calls/tutors/${encodeURIComponent(tutorId)}/reviews`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    token
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error ${res.status} al cargar reseñas: ${text || 'error desconocido'}`);
  }
  return res.json() as Promise<CallReview[]>;
}

export async function getTutorRatingSummary(
  tutorId: string,
  token: string
): Promise<TutorRatingSummary | null> {
  const res = await authFetch(
    `/api/calls/tutors/${encodeURIComponent(tutorId)}/rating-summary`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    token
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(`Error ${res.status} al cargar rating: ${text || 'error desconocido'}`);
  }

  const json = (await res.json()) as TutorRatingSummary;
  if (!json || !json.totalReviews) return null;
  return json;
}
