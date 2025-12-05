// src/service/Api-call.ts
const API_BASE_URL = 'http://localhost:8093';
 
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
  // 1) Intentar endpoint backend normal
  const res = await fetch(`${API_BASE_URL}/api/calls/ice-servers`);
  if (!res.ok) {
    // fallback a stun por defecto
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
 
 