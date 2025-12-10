import React from 'react';
import '../../styles/CallChatButton.css';
type Props = { onOpen?: () => void };

export default function CallChatButton({ onOpen }: Readonly<Props>) {
  const handle = () => {
    globalThis.dispatchEvent(new CustomEvent('open-chat-drawer'));
    onOpen?.();
  };
  return (
    <button
      type="button"
      className="call-chat-button px-3 py-2 rounded-full border border-indigo-400 text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition"
      onClick={handle}
    >
      💬 <span>Chat</span>
    </button>
  );
}
