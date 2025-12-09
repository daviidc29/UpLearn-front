// src/service/Api-call.ts

const API_BASE_URL = 'https://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net';

export async function createCallSession(reservationId: string, token: string) {
  const res = await fetch(`${API_BASE_URL}/api/calls/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ reservationId }),
  });

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
    return Array.isArray(json) ? json as RTCIceServer[] : [{ urls: 'stun:stun.l.google.com:19302' }];
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
