import { ChatSocket } from './ChatSocket';

let shared: ChatSocket | null = null;
let sharedToken: string | null = null;

export function getSharedChatSocket(token: string) {
  if (!shared || sharedToken !== token) {
    if (shared) shared.disconnect();
    shared = new ChatSocket({ autoReconnect: true, pingIntervalMs: 20000 });
    sharedToken = token;
    shared.connect(token);
  } else {
    shared.connect(token);
  }
  return shared;
}

export function dropSharedChatSocket() {
  if (shared) shared.disconnect();
  shared = null;
  sharedToken = null;
}
