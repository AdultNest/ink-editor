/**
 * ImageMessage Component
 *
 * Displays an image message with validation indicator.
 */

import { useState, useEffect } from 'react';
import type { ImageMessageProps } from './types';
import './Preview.css';

export function ImageMessage({
  src,
  alt,
  isPlayer,
  isValid,
  filename,
  onClick,
}: ImageMessageProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes (e.g., after filename resolution)
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const classNames = [
    'image-message',
    isPlayer ? 'image-message--player' : 'image-message--npc',
    (!isValid || hasError) ? 'image-message--invalid' : '',
  ].filter(Boolean).join(' ');

  const handleError = () => {
    setHasError(true);
  };

  return (
    <div className={classNames} onClick={onClick}>
      <div className="image-message__wrapper">
        {isValid && !hasError ? (
          <img
            src={src}
            alt={alt || filename}
            className="image-message__img"
            onError={handleError}
          />
        ) : (
          <div className="image-message__placeholder">
            <span className="image-message__placeholder-icon">🖼️</span>
            <span className="image-message__placeholder-text">{filename}</span>
          </div>
        )}
        {(!isValid || hasError) && (
          <div className="image-message__error">
            Image not found: {filename}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageMessage;
