import { ENV } from '../utils/env';

export type TaskStatus =
  | 'PUBLICADA'
  | 'ACEPTADA'
  | 'CANCELADA'
  | 'FINALIZADA'
  | 'RECHAZADA'
  | 'EN_PROGRESO';

export interface TaskPayload {
  titulo: string;
  descripcion: string;
  materia: string;
  fechaLimite?: string;
}

export interface Task {
  id: string;
  studentId: string;
  tutorId: string | null;
  titulo: string;
  descripcion: string;
  materia: string;
  fechaLimite: string | null;
  estado: TaskStatus;
  tipoSolicitud?: string;
  fechaCreacion?: string;
  fechaAceptacion?: string | null;
}

export interface TutorScheduleSlot {
  date: string;
  hour: string;
  status: string;
  reservationId?: string | null;
  studentId?: string | null;
}

const BASE = (ENV.TASKS_BASE || '').replace(/\/$/, '');

function headers(token?: string) {
  const h: Record<string, string> = { 
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
    const baseMsg = typeof body === 'string'
      ? body
      : body?.message || body?.error || body?.path || `HTTP ${res.status}`;
    const msgWithStatus = `HTTP ${res.status}: ${baseMsg}`;
    throw new Error(msgWithStatus);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export async function postTask(payload: TaskPayload, token?: string): Promise<Task> {
  const url = `${BASE}/api/tasks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  return handle<Task>(res);
}

export async function getMyTasks(token?: string): Promise<Task[]> {
  const url = `${BASE}/api/tasks/my-tasks`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle<Task[]>(res);
}

export async function getTaskTutorSchedule(taskId: string, weekStart: string, token?: string): Promise<TutorScheduleSlot[]> {
  const url = `${BASE}/api/tasks/${encodeURIComponent(taskId)}/tutor-schedule?weekStart=${encodeURIComponent(weekStart)}`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle<TutorScheduleSlot[]>(res);
}

export async function cancelTask(taskId: string, token?: string): Promise<Task> {
  const url = `${BASE}/api/tasks/${encodeURIComponent(taskId)}/cancel`;
  const res = await fetch(url, { method: 'PATCH', headers: headers(token) });
  return handle<Task>(res);
}

export async function getAvailableTasks(token?: string): Promise<Task[]> {
  const url = `${BASE}/api/tasks/available`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle<Task[]>(res);
}

export async function acceptTask(taskId: string, token?: string): Promise<Task> {
  const url = `${BASE}/api/tasks/${encodeURIComponent(taskId)}/accept`;
  const res = await fetch(url, { method: 'POST', headers: headers(token) });
  return handle<Task>(res);
}

export async function getAcceptedTasks(token?: string): Promise<Task[]> {
  const url = `${BASE}/api/tasks/accepted`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  return handle<Task[]>(res);
}
