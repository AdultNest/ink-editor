/**
 * DivertArrow Component
 *
 * Displays a divert target indicator.
 */

import type { DivertArrowProps } from './types';
import './Preview.css';

export function DivertArrow({
  target,
  onClick,
}: DivertArrowProps) {
  const isEnd = target === 'END';

  return (
    <div className="divert-arrow" onClick={onClick}>
      <span className="divert-arrow__symbol">→</span>
      <span className={`divert-arrow__target ${isEnd ? 'divert-arrow__target--end' : ''}`}>
        {target}
      </span>
    </div>
  );
}

export default DivertArrow;
