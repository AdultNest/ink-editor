/**
 * FlagOperationBadge Component
 *
 * Displays a story flag set/remove operation.
 */

import type { FlagOperationBadgeProps } from './types';
import './Preview.css';

export function FlagOperationBadge({
  operation,
  flagName,
  onClick,
}: FlagOperationBadgeProps) {
  const classNames = [
    'flag-badge',
    operation === 'set' ? 'flag-badge--set' : 'flag-badge--remove',
  ].join(' ');

  return (
    <div className={classNames} onClick={onClick}>
      <span className="flag-badge__icon">
        {operation === 'set' ? '🚩' : '🗑️'}
      </span>
      <span className="flag-badge__operation">{operation}</span>
      <span className="flag-badge__name">{flagName}</span>
    </div>
  );
}

export default FlagOperationBadge;
