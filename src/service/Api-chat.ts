import { ENV } from '../utils/env';

const CHAT_BASE = ((ENV as any).CHAT_API_BASE || 'https://chats-cbh7cgfxa4ceahde.canadacentral-01.azurewebsites.net').replace(/\/$/, '');

export interface ChatContact {
  id: string;
  sub: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ChatMessageData {
  id: string;
  chatId: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  delivered: boolean;
  read: boolean;
}

/** Validación ligera para no disparar fetch con token vacío/incorrecto */
const isProbablyJwt = (t?: string) =>
  !!t && typeof t === 'string' && t.split('.').length >= 3 && t.trim().length > 20;

async function fetchJson(url: string, token: string) {
  if (!isProbablyJwt(token)) {
    throw new Error('UNAUTHORIZED_EAGER');
  }
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
  return resp.json();
}

/** Lista de contactos disponibles para el usuario autenticado */
export async function getChatContacts(token: string): Promise<ChatContact[]> {
  const url = `${CHAT_BASE}/api/chat/contacts`;
  return fetchJson(url, token);
}

/** Calcula chatId estable con otro usuario */
export async function getChatIdWith(otherUserId: string, token: string): Promise<string> {
  const url = `${CHAT_BASE}/api/chat/chat-id/with/${encodeURIComponent(otherUserId)}`;
  const data = await fetchJson(url, token);
  return data.chatId;
}

/** Historial de un chat */
export async function getChatHistory(chatId: string, token: string): Promise<ChatMessageData[]> {
  const url = `${CHAT_BASE}/api/chat/history/${encodeURIComponent(chatId)}`;
  return fetchJson(url, token);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}
/** Genera un chatId estable localmente (sha256 de ambos IDs concatenados) */
export async function localStableChatId(a: string, b: string): Promise<string> {
  const [min, max] = [a, b].sort((x, y) => x.localeCompare(y));
  const key = `${min}:${max}`;
  try {
    const enc = new TextEncoder().encode(key);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return bufferToHex(buf);
  } catch {
    return key;
  }
}
