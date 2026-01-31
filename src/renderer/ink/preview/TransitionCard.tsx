/**
 * TransitionCard Component
 *
 * Displays a chapter/scene transition.
 */

import type { TransitionCardProps } from './types';
import './Preview.css';

export function TransitionCard({
  title,
  subtitle,
  onClick,
}: TransitionCardProps) {
  return (
    <div className="transition-card" onClick={onClick}>
      <div className="transition-card__title">{title || 'Untitled'}</div>
      {subtitle && (
        <div className="transition-card__subtitle">{subtitle}</div>
      )}
    </div>
  );
}

export default TransitionCard;
