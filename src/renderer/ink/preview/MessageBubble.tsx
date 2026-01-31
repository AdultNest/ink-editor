/**
 * MessageBubble Component
 *
 * Displays a text message in a chat bubble style.
 */

import type { MessageBubbleProps } from './types';
import './Preview.css';

export function MessageBubble({
  content,
  isPlayer,
  timestamp,
  onClick,
}: MessageBubbleProps) {
  const isEmpty = !content || content.trim() === '';
  const classNames = [
    'message-bubble',
    isPlayer ? 'message-bubble--player' : 'message-bubble--npc',
    isEmpty ? 'message-bubble--empty' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames} onClick={onClick}>
      <div className="message-bubble__content">
        {isEmpty ? (
          <em className="message-bubble__placeholder">(click to edit message)</em>
        ) : (
          content
        )}
      </div>
      {timestamp && (
        <div className="message-bubble__timestamp">{timestamp}</div>
      )}
    </div>
  );
}

export default MessageBubble;
