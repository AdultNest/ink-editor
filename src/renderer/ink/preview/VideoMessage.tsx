/**
 * VideoMessage Component
 *
 * Displays a video message with validation indicator.
 */

import { useState, useEffect } from 'react';
import type { VideoMessageProps } from './types';
import './Preview.css';

export function VideoMessage({
  src,
  isPlayer,
  isValid,
  filename,
  onClick,
}: VideoMessageProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes (e.g., after filename resolution)
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const classNames = [
    'video-message',
    isPlayer ? 'video-message--player' : 'video-message--npc',
    (!isValid || hasError) ? 'video-message--invalid' : '',
  ].filter(Boolean).join(' ');

  const handleError = () => {
    setHasError(true);
  };

  return (
    <div className={classNames} onClick={onClick}>
      <div className="video-message__wrapper">
        {isValid && !hasError ? (
          <video
            src={src}
            className="video-message__video"
            controls
            preload="metadata"
            onError={handleError}
          />
        ) : (
          <div className="video-message__placeholder">
            <span className="video-message__placeholder-icon">🎬</span>
            <span className="video-message__placeholder-text">{filename}</span>
          </div>
        )}
        {(!isValid || hasError) && (
          <div className="video-message__error">
            Video not found: {filename}
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoMessage;
