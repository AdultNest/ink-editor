/**
 * TypingIndicator Component
 *
 * Shows a typing animation indicator.
 */

import type { TypingIndicatorProps } from './types';
import './Preview.css';

export function TypingIndicator({
  duration,
  animated,
  onClick,
}: TypingIndicatorProps) {
  const classNames = [
    'typing-indicator',
    animated ? 'typing-indicator--animated' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames} onClick={onClick}>
      <div className="typing-indicator__dots">
        <span className="typing-indicator__dot" />
        <span className="typing-indicator__dot" />
        <span className="typing-indicator__dot" />
      </div>
      <span className="typing-indicator__duration">{duration}s</span>
    </div>
  );
}

export default TypingIndicator;
