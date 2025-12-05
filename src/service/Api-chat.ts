import { ENV } from '../utils/env';

const CHAT_BASE = ((ENV as any).CHAT_API_BASE || 'http://localhost:8091').replace(/\/$/, '');

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

/** Lista de contactos disponibles para el usuario autenticado */
export async function getChatContacts(token: string): Promise<ChatContact[]> {
  const url = `${CHAT_BASE}/api/chat/contacts`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('No se pudo cargar contactos');
  return resp.json();
}

/** Calcula chatId estable con otro usuario */
export async function getChatIdWith(otherUserId: string, token: string): Promise<string> {
  const url = `${CHAT_BASE}/api/chat/chat-id/with/${encodeURIComponent(otherUserId)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('No se pudo calcular chatId');
  const data = await resp.json();
  return data.chatId;
}

/** Historial de un chat */
export async function getChatHistory(chatId: string, token: string): Promise<ChatMessageData[]> {
  const url = `${CHAT_BASE}/api/chat/history/${encodeURIComponent(chatId)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('No se pudo cargar el historial del chat');
  return resp.json();
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