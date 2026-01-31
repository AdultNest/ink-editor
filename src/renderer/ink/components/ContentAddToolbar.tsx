/**
 * ContentAddToolbar Component
 *
 * Toolbar for adding new content items to the visual editor.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { KnotContentItemType } from '../parser/inkTypes';

import './KnotVisualEditor.css';

export interface ContentAddToolbarProps {
  /** Callback when user wants to add a new item */
  onAdd: (type: KnotContentItemType) => void;
}

// Quick-access buttons for common types
const QUICK_TYPES: Array<{
  type: KnotContentItemType;
  label: string;
  icon: string;
}> = [
  { type: 'text', label: 'Text', icon: '💬' },
  { type: 'choice', label: 'Choice', icon: '❓' },
  { type: 'image', label: 'Image', icon: '🖼️' },
];

// More types in dropdown
const MORE_TYPES: Array<{
  type: KnotContentItemType;
  label: string;
  icon: string;
}> = [
  { type: 'player-image', label: 'Player Image', icon: '📱' },
  { type: 'video', label: 'Video', icon: '🎬' },
  { type: 'player-video', label: 'Player Video', icon: '📹' },
  { type: 'fake-type', label: 'Typing Indicator', icon: '⏳' },
  { type: 'side-story', label: 'Side Story', icon: '📖' },
  { type: 'transition', label: 'Transition', icon: '🎭' },
  { type: 'flag-operation', label: 'Flag Operation', icon: '🚩' },
  { type: 'divert', label: 'Divert', icon: '➡️' },
  { type: 'raw', label: 'Raw Ink', icon: '📝' },
];

export function ContentAddToolbar({ onAdd }: ContentAddToolbarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleAdd = useCallback(
    (type: KnotContentItemType) => {
      onAdd(type);
      setIsDropdownOpen(false);
    },
    [onAdd]
  );

  return (
    <div className="content-add-toolbar">
      <span className="content-add-toolbar__label">Add:</span>

      {/* Quick-access buttons */}
      {QUICK_TYPES.map(({ type, label, icon }) => (
        <button
          key={type}
          className="content-add-toolbar__btn"
          onClick={() => handleAdd(type)}
          title={`Add ${label}`}
        >
          <span className="content-add-toolbar__btn-icon">{icon}</span>
          {label}
        </button>
      ))}

      {/* More dropdown */}
      <div className="content-add-toolbar__more" ref={dropdownRef}>
        <button
          className="content-add-toolbar__more-btn"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          More ▾
        </button>

        {isDropdownOpen && (
          <div className="content-add-toolbar__dropdown">
            {MORE_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                className="content-add-toolbar__dropdown-item"
                onClick={() => handleAdd(type)}
              >
                <span className="content-add-toolbar__dropdown-icon">
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ContentAddToolbar;
