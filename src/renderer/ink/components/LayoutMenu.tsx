/**
 * LayoutMenu component
 *
 * Dropdown menu for selecting auto-layout algorithms.
 */

import { useState, useRef, useEffect } from 'react';
import type { LayoutAlgorithm } from '../layout';

interface LayoutOption {
  id: LayoutAlgorithm;
  label: string;
  description: string;
  icon: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'hierarchical',
    label: 'Hierarchical',
    description: 'Left-to-right flow layout',
    icon: '→',
  },
  {
    id: 'vertical',
    label: 'Vertical',
    description: 'Top-to-bottom flow layout',
    icon: '↓',
  },
  {
    id: 'grid',
    label: 'Grid',
    description: 'Simple grid arrangement',
    icon: '⊞',
  },
  {
    id: 'compact',
    label: 'Compact Clusters',
    description: 'Group connected nodes',
    icon: '◫',
  },
];

interface LayoutMenuProps {
  onLayout: (algorithm: LayoutAlgorithm) => void;
  disabled?: boolean;
}

export function LayoutMenu({ onLayout, disabled }: LayoutMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleOptionClick = (algorithm: LayoutAlgorithm) => {
    onLayout(algorithm);
    setIsOpen(false);
  };

  return (
    <div className="ink-layout-menu" ref={menuRef}>
      <button
        className={`ink-btn ink-btn-layout ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title="Auto-layout nodes"
      >
        Layout
        <span className="ink-layout-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="ink-layout-dropdown">
          {LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="ink-layout-option"
              onClick={() => handleOptionClick(option.id)}
            >
              <span className="ink-layout-option-icon">{option.icon}</span>
              <div className="ink-layout-option-text">
                <span className="ink-layout-option-label">{option.label}</span>
                <span className="ink-layout-option-desc">{option.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LayoutMenu;
