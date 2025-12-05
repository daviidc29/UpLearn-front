import React from 'react';
import { ChatMessageData } from '../../service/Api-chat';

interface ChatMessageBubbleProps {
  message: ChatMessageData;
  isMine: boolean;
}

/** Resuelve la marca temporal de un mensaje */
function resolveTimestamp(m: ChatMessageData | Record<string, unknown> | null | undefined): string {
  if (!m) return new Date().toISOString();
  const maybe = m as Record<string, unknown>;
  const created = maybe['createdAt'];
  if (typeof created === 'string') return created;
  const timestamp = maybe['timestamp'];
  if (typeof timestamp === 'string') return timestamp;
  return new Date().toISOString();
}

/** Componente para burbuja de mensaje individual */
export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, isMine }) => {
  const bubbleClass = isMine ? 'chat-bubble mine' : 'chat-bubble theirs';
  const ts = resolveTimestamp(message);
  return (
    <div className={bubbleClass}>
      <p>{message.content}</p>
      <span className="timestamp">
        {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};