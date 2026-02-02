/**
 * ComponentPicker component
 *
 * Dropdown/chip picker for selecting prompt components from a category.
 */

import { useState, useRef, useEffect } from 'react';
import type { PromptComponent } from '../../services';
import './ComponentPicker.css';

export interface ComponentPickerProps {
  /** Available components to choose from */
  components: PromptComponent[];
  /** Currently selected component ID (or null) */
  selectedId: string | null;
  /** Callback when selection changes */
  onSelect: (id: string | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label for the picker */
  label?: string;
}

export function ComponentPicker({
  components,
  selectedId,
  onSelect,
  placeholder = 'Select...',
  label,
}: ComponentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedComponent = components.find(c => c.id === selectedId);

  return (
    <div className="component-picker" ref={containerRef}>
      {label && <label className="component-picker__label">{label}</label>}
      <button
        className={`component-picker__trigger ${isOpen ? 'open' : ''} ${selectedComponent ? 'has-value' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="component-picker__value">
          {selectedComponent ? selectedComponent.name : placeholder}
        </span>
        <span className="component-picker__arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="component-picker__dropdown">
          {/* Clear option */}
          <button
            className={`component-picker__option ${!selectedId ? 'selected' : ''}`}
            onClick={() => {
              onSelect(null);
              setIsOpen(false);
            }}
          >
            <span className="component-picker__option-name">None</span>
          </button>

          {/* Component options */}
          {components.map(component => (
            <button
              key={component.id}
              className={`component-picker__option ${selectedId === component.id ? 'selected' : ''}`}
              onClick={() => {
                onSelect(component.id);
                setIsOpen(false);
              }}
            >
              <span className="component-picker__option-name">{component.name}</span>
              {component.positive && (
                <span className="component-picker__option-preview" title={component.positive}>
                  {component.positive.length > 40 ? `${component.positive.substring(0, 40)}...` : component.positive}
                </span>
              )}
            </button>
          ))}

          {components.length === 0 && (
            <div className="component-picker__empty">No components available</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ComponentPicker;
