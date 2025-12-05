import { ENV } from '../utils/env';

export type CellStatus =
  | 'DISPONIBLE'
  | 'PENDIENTE'
  | 'ACEPTADO'
  | 'CANCELADO'
  | 'VENCIDA'
  | 'ACTIVA'
  | 'INCUMPLIDA'
  | 'FINALIZADA'
  | null;

export interface ScheduleCell {
  date: string;
  hour: string;
  status: CellStatus;
  reservationId?: string | null;
  tutorId?: string | null;
  studentId?: string | null;
  studentName?: string;
  studentAvatar?: string;
  tutorName?: string;
  tutorAvatar?: string;
}

export interface Reservation {
  id: string;
  tutorId: string;
  studentId: string;
  date: string;
  start: string;
  end: string;
  status: 'PENDIENTE' | 'ACEPTADO' | 'CANCELADO' | 'ACTIVA' | 'INCUMPLIDA' | 'FINALIZADA' | 'VENCIDA';
  attended?: boolean | null;
  studentName?: string;
  studentAvatar?: string;
  tutorName?: string;
  tutorAvatar?: string;
}

const BASE = (ENV.SCHEDULER_BASE || 'http://localhost:8090').replace(/\/$/, '');

function headers(token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function handle(res: Response) {
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
    const baseMsg = typeof body === 'string'
      ? body
      : body?.message || body?.error || body?.path || `HTTP ${res.status}`;
    const msgWithStatus = `HTTP ${res.status}: ${baseMsg}`;
    throw new Error(msgWithStatus);
  }
  if (res.status === 204) return null as any;
  return res.json();
}


export async function createReservation(tutorId: string, date: string, hour: string, token?: string): Promise<Reservation> {
  const url = `${BASE}/api/reservations`;
  const res = await fetch(url, { method: 'POST', headers: headers(token), body: JSON.stringify({ tutorId, date, hour }) });
  return handle(res);
}

export async function getMyReservations(from: string, to: string, token?: string): Promise<Reservation[]> {
  const url = `${BASE}/api/reservations/my?from=${from}&to=${to}`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle(res);
}

export async function getTutorReservations(from: string, to: string, token?: string): Promise<Reservation[]> {
  const url = `${BASE}/api/reservations/for-me?from=${from}&to=${to}`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle(res);
}

export async function cancelReservation(id: string, token?: string): Promise<Reservation> {
  const url = `${BASE}/api/reservations/${id}/cancel`;
  const res = await fetch(url, { method: 'PATCH', headers: headers(token) });
  return handle(res);
}

export async function acceptReservation(
  id: string,
  studentId?: string,
  token?: string
): Promise<Reservation> {
  const url = `${BASE}/api/reservations/${id}/accept`;
  const body = studentId ? JSON.stringify({ studentId }) : undefined;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(token),
    body
  });
  return handle(res);
}

export async function setReservationAttended(id: string, value: boolean, token?: string): Promise<Reservation> {
  const url = `${BASE}/api/reservations/${id}/attended?value=${value}`;
  const res = await fetch(url, { method: 'PATCH', headers: headers(token) });
  return handle(res);
}


export async function getScheduleForTutor(tutorId: string, weekStart: string, token?: string): Promise<ScheduleCell[]> {
  const url = `${BASE}/api/schedule/tutor/${encodeURIComponent(tutorId)}?weekStart=${weekStart}`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle(res);
}

export async function getPublicAvailabilityForTutor(tutorId: string, weekStart: string, token?: string): Promise<ScheduleCell[]> {
  return getScheduleForTutor(tutorId, weekStart, token);
}

export async function addAvailability(date: string, hours: string[], token?: string): Promise<{ addedCount: number }> {
  const url = `${BASE}/api/availability/add`;
  const res = await fetch(url, { method: 'POST', headers: headers(token), body: JSON.stringify({ date, hours }) });
  return handle(res);
}

export async function clearDayAvailability(date: string, token?: string): Promise<void> {
  const url = `${BASE}/api/availability/day/${date}`;
  const res = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify({ hours: [] }) });
  await handle(res);
}