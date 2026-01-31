/**
 * SideStoryMarker Component
 *
 * Displays a side story trigger indicator.
 */

import type { SideStoryMarkerProps } from './types';
import './Preview.css';

export function SideStoryMarker({
  storyName,
  onClick,
}: SideStoryMarkerProps) {
  return (
    <div className="side-story-marker" onClick={onClick}>
      <span className="side-story-marker__icon">📖</span>
      <span className="side-story-marker__label">Side Story:</span>
      <span className="side-story-marker__name">{storyName}</span>
    </div>
  );
}

export default SideStoryMarker;
