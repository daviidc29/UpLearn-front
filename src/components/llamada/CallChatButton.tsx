import React from 'react';
 
type Props = { onOpen?: () => void };
 
export default function CallChatButton({ onOpen }: Readonly<Props>) {
  const handle = () => {
    // Dispara un evento global que el componente del chat (drawer) debe escuchar
    globalThis.dispatchEvent(new CustomEvent('open-chat-drawer'));
    onOpen?.();
  };
  return (
    <button className="px-3 py-2 rounded-md border text-white bg-indigo-600 hover:bg-indigo-700 transition" onClick={handle}>
      Chat
    </button>
  );
}
 