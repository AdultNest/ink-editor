/**
 * QuickPromptBuilder component
 *
 * An inline, non-invasive component for quickly adding prompt library components
 * to image generation. Shows as a compact, collapsible section with chip-based selection.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type ProjectPromptLibrary,
  type PromptComponent,
  PromptComponentCategory,
  CATEGORY_INFO,
  promptLibraryService,
  getDefaultLibrary,
} from '../../services';
import './QuickPromptBuilder.css';

export interface QuickPromptBuilderProps {
  /** Project path for loading the prompt library */
  projectPath: string;
  /** Callback when selected components change */
  onComponentsChange: (positive: string, negative: string) => void;
  /** Optional: initially expanded state */
  initiallyExpanded?: boolean;
}

export function QuickPromptBuilder({
  projectPath,
  onComponentsChange,
  initiallyExpanded = false,
}: QuickPromptBuilderProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [library, setLibrary] = useState<ProjectPromptLibrary>(getDefaultLibrary());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<PromptComponentCategory | null>(null);

  // Load library when expanded
  useEffect(() => {
    if (isExpanded && projectPath) {
      setIsLoading(true);
      promptLibraryService.loadLibrary(projectPath)
        .then(lib => {
          setLibrary(lib);
          setIsLoading(false);
        })
        .catch(() => {
          setLibrary(getDefaultLibrary());
          setIsLoading(false);
        });
    }
  }, [isExpanded, projectPath]);

  // Build prompt from selected components
  const builtPrompt = useMemo(() => {
    return promptLibraryService.buildPromptFromComponents(library, Array.from(selectedIds));
  }, [library, selectedIds]);

  // Notify parent of changes
  useEffect(() => {
    onComponentsChange(builtPrompt.positive, builtPrompt.negative);
  }, [builtPrompt, onComponentsChange]);

  // Get components for active category
  const categoryComponents = useMemo(() => {
    if (!activeCategory) return [];
    return promptLibraryService.getComponentsByCategory(library, activeCategory);
  }, [library, activeCategory]);

  // Get selected components for display
  const selectedComponents = useMemo(() => {
    return Array.from(selectedIds)
      .map(id => promptLibraryService.getComponentById(library, id))
      .filter((c): c is PromptComponent => c !== undefined);
  }, [library, selectedIds]);

  // Toggle component selection
  const toggleComponent = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Clear all selections
  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
    setActiveCategory(null);
  }, []);

  // Get category info by category enum
  const getCategoryInfo = (category: PromptComponentCategory) => {
    return CATEGORY_INFO.find(info => info.category === category);
  };

  return (
    <div className="quick-prompt-builder">
      {/* Header - always visible */}
      <div
        className="quick-prompt-builder__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="quick-prompt-builder__title">
          <span className="quick-prompt-builder__icon">{isExpanded ? '▾' : '▸'}</span>
          <span>Quick Add from Library</span>
          {selectedComponents.length > 0 && (
            <span className="quick-prompt-builder__count">{selectedComponents.length}</span>
          )}
        </div>
        {selectedComponents.length > 0 && (
          <button
            className="quick-prompt-builder__clear"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            title="Clear all"
          >
            Clear
          </button>
        )}
      </div>

      {/* Selected chips - shown when collapsed if any selected */}
      {!isExpanded && selectedComponents.length > 0 && (
        <div className="quick-prompt-builder__selected-preview">
          {selectedComponents.map(comp => {
            const catInfo = getCategoryInfo(comp.category);
            return (
              <span
                key={comp.id}
                className="quick-prompt-builder__chip quick-prompt-builder__chip--selected"
                onClick={() => toggleComponent(comp.id)}
                title={`${comp.positive}${comp.negative ? ` | Negative: ${comp.negative}` : ''}`}
              >
                {catInfo?.icon} {comp.name}
                <span className="quick-prompt-builder__chip-remove">×</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="quick-prompt-builder__content">
          {isLoading ? (
            <div className="quick-prompt-builder__loading">Loading...</div>
          ) : (
            <>
              {/* Category tabs */}
              <div className="quick-prompt-builder__categories">
                {CATEGORY_INFO.map(info => {
                  const count = promptLibraryService.getComponentsByCategory(library, info.category).length;
                  const selectedInCategory = selectedComponents.filter(c => c.category === info.category).length;
                  return (
                    <button
                      key={info.category}
                      className={`quick-prompt-builder__category-btn ${activeCategory === info.category ? 'active' : ''}`}
                      onClick={() => setActiveCategory(activeCategory === info.category ? null : info.category)}
                      title={info.description}
                    >
                      {info.icon} {info.label}
                      {selectedInCategory > 0 && (
                        <span className="quick-prompt-builder__category-selected">{selectedInCategory}</span>
                      )}
                      {count > 0 && selectedInCategory === 0 && (
                        <span className="quick-prompt-builder__category-count">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Component chips for active category */}
              {activeCategory && (
                <div className="quick-prompt-builder__components">
                  {categoryComponents.length === 0 ? (
                    <div className="quick-prompt-builder__empty">
                      No components in this category. Add some in the Prompt Library.
                    </div>
                  ) : (
                    categoryComponents.map(comp => (
                      <button
                        key={comp.id}
                        className={`quick-prompt-builder__chip ${selectedIds.has(comp.id) ? 'quick-prompt-builder__chip--selected' : ''}`}
                        onClick={() => toggleComponent(comp.id)}
                        title={`${comp.positive}${comp.negative ? ` | Negative: ${comp.negative}` : ''}`}
                      >
                        {comp.name}
                        {selectedIds.has(comp.id) && (
                          <span className="quick-prompt-builder__chip-check">✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Selected summary */}
              {selectedComponents.length > 0 && (
                <div className="quick-prompt-builder__summary">
                  <div className="quick-prompt-builder__summary-label">Selected:</div>
                  <div className="quick-prompt-builder__summary-chips">
                    {selectedComponents.map(comp => {
                      const catInfo = getCategoryInfo(comp.category);
                      return (
                        <span
                          key={comp.id}
                          className="quick-prompt-builder__chip quick-prompt-builder__chip--selected"
                          onClick={() => toggleComponent(comp.id)}
                        >
                          {catInfo?.icon} {comp.name}
                          <span className="quick-prompt-builder__chip-remove">×</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default QuickPromptBuilder;
