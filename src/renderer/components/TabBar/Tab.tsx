/**
 * Individual Tab component for the TabBar
 *
 * Renders a single tab with file type icon, name, and close button.
 * Supports visual states for active, dirty (unsaved), and pinned tabs.
 */

import type { TabProps } from './types';

/**
 * Tab component representing an open file
 *
 * Displays:
 * - File type icon (emoji-based)
 * - File name with truncation on overflow
 * - Dirty indicator (dot) for unsaved changes
 * - Close button (x) to close the tab
 *
 * Interactions:
 * - Click to select/activate the tab
 * - Middle-click to close the tab
 * - Double-click to pin/unpin the tab
 * - Close button click to close the tab
 *
 * @param props - TabProps including tab data and event handlers
 */
function Tab({ tab, onSelect, onClose, onPin, onDoubleClick }: TabProps) {
  const { id, fileName, icon, isActive, isDirty, isPinned } = tab;

  // Handle tab click to select it
  const handleClick = (e: React.MouseEvent) => {
    // Prevent selection when clicking the close button
    if ((e.target as HTMLElement).closest('.tab__close')) {
      return;
    }
    onSelect(id);
  };

  // Handle middle mouse button click to close tab
  const handleAuxClick = (e: React.MouseEvent) => {
    // Middle mouse button is button 1
    if (e.button === 1 && !isPinned) {
      e.preventDefault();
      onClose(id);
    }
  };

  // Handle close button click
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(id);
  };

  // Handle double-click to pin tab
  const handleDoubleClick = () => {
    if (onDoubleClick) {
      onDoubleClick(id);
    } else if (onPin) {
      onPin(id);
    }
  };

  // Handle keyboard interaction for accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onClose(id);
    }
  };

  // Handle close button keyboard interaction
  const handleCloseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onClose(id);
    }
  };

  // Build class names for visual states
  const classNames = ['tab'];
  if (isActive) {
    classNames.push('tab--active');
  }
  if (isDirty) {
    classNames.push('tab--dirty');
  }
  if (isPinned) {
    classNames.push('tab--pinned');
  }

  return (
    <div
      className={classNames.join(' ')}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      role="tab"
      aria-selected={isActive}
      aria-label={`${fileName}${isDirty ? ' (unsaved)' : ''}${isPinned ? ' (pinned)' : ''}`}
      tabIndex={isActive ? 0 : -1}
    >
      {/* File type icon */}
      <span className="tab__icon" aria-hidden="true">
        {icon}
      </span>

      {/* File name */}
      <span className="tab__name" title={tab.filePath}>
        {fileName}
      </span>

      {/* Dirty indicator (unsaved changes) */}
      {isDirty && (
        <span className="tab__dirty" aria-hidden="true" title="Unsaved changes">
          •
        </span>
      )}

      {/* Pinned indicator */}
      {isPinned && !isDirty && (
        <span className="tab__pinned" aria-hidden="true" title="Pinned">
          📌
        </span>
      )}

      {/* Close button - hidden for pinned tabs, always visible otherwise */}
      {!isPinned && (
        <button
          className="tab__close"
          onClick={handleClose}
          onKeyDown={handleCloseKeyDown}
          aria-label={`Close ${fileName}`}
          title="Close"
          tabIndex={-1}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default Tab;
