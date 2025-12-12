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

const CHAT_BASE = ('https://chats-cbh7cgfxa4ceahde.canadacentral-01.azurewebsites.net')
  .replace(/\/$/, '');

const isProbablyJwt = (t?: string) =>
  !!t && typeof t === 'string' && t.split('.').length >= 3 && t.trim().length > 20;

async function fetchJson(url: string, token: string) {
  if (!isProbablyJwt(token)) throw new Error('UNAUTHORIZED_EAGER');
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
  return resp.json();
}

export async function listContacts(token: string): Promise<ChatContact[]> {
  return fetchJson(`${CHAT_BASE}/api/chat/contacts`, token);
}

export async function getChatIdWith(otherUserId: string, token: string): Promise<string> {
  const data = await fetchJson(`${CHAT_BASE}/api/chat/chat-id/with/${encodeURIComponent(otherUserId)}`, token);
  return data.chatId as string;
}

export async function getChatHistory(chatId: string, token: string): Promise<ChatMessageData[]> {
  return fetchJson(`${CHAT_BASE}/api/chat/history/${encodeURIComponent(chatId)}`, token);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return hex;
}
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

export function wsUrlFromHttpBase(): string {
  return CHAT_BASE.replace(/^http/, 'ws') + '/ws/chat';
}