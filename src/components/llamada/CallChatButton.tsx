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
      className="call-chat-button"
      onClick={handle}
    >
      <span className="call-chat-icon">💬</span>
      <span className="call-chat-label">Chat</span>
    </button>
  );
}
