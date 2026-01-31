/**
 * KnotVisualEditor Component
 *
 * Visual editor for knot content with WhatsApp-style message composer.
 * - Type messages directly and press Enter to add
 * - Alt+Enter for player choices
 * - "+" button for media and special content
 * - Click items to edit them in sidebar
 * - Alt+Arrow keys to navigate the caret through nested content
 */

import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import type { InkKnot, KnotContentItem, KnotContentItemType } from '../parser/inkTypes';
import { useKnotContent, type InsertPosition } from '../hooks/useKnotContent';
import { useCaretNavigation, flattenItems, type CaretPosition } from '../hooks/useCaretNavigation';
import { PreviewRenderer } from '../preview';
import { ContentItemEditor } from './ContentItemEditor';
import { MessageComposer } from './MessageComposer';
import { stripPositionComment } from '../parser/inkGenerator';

import './KnotVisualEditor.css';

export interface KnotVisualEditorProps {
  /** The knot being edited */
  knot: InkKnot;
  /** Project path for media resolution */
  projectPath: string;
  /** Callback when content is updated */
  onUpdate: (newBodyContent: string) => void;
  /** Available knot names for divert autocomplete */
  availableKnots?: string[];
  /** Available flag names for autocomplete */
  availableFlags?: string[];
}

// Types that need configuration after being added (should open editor immediately)
const TYPES_NEEDING_CONFIG: KnotContentItemType[] = [
  'image',
  'player-image',
  'video',
  'player-video',
  'divert',
  'side-story',
  'transition',
  'flag-operation',
  'choice',
  'fake-type',
  'wait',
  'raw',
];

export function KnotVisualEditor({
  knot,
  projectPath,
  onUpdate,
  availableKnots = [],
  availableFlags = [],
}: KnotVisualEditorProps) {
  // Strip position comment for editing
  const cleanContent = useMemo(
    () => stripPositionComment(knot.bodyContent),
    [knot.bodyContent]
  );

  // Knot content state management
  const {
    items,
    addItemAt,
    addTextMessageAt,
    updateItem,
    deleteItem,
    moveItemUp,
    moveItemDown,
    serialize,
    validationErrors,
    isDirty,
    reset,
  } = useKnotContent({
    initialContent: cleanContent,
    projectPath,
    knotPosition: knot.position,
  });

  // Caret navigation
  const {
    caret,
    setCaret,
    moveCaretUp,
    moveCaretDown,
    moveCaretIn,
    moveCaretOut,
    setCaretAfterItem,
    setCaretToEnd,
    getInsertPosition,
    isInsideChoice,
    flatItems,
  } = useCaretNavigation(items);

  // Currently selected item for editing
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = useMemo(
    () => {
      // Search in flat items
      const found = flatItems.find((fi) => fi.item.id === selectedItemId);
      return found?.item;
    },
    [flatItems, selectedItemId]
  );

  // Ref to the container for keyboard events
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when items change
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current.querySelector('.preview-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [items.length]);

  // Reset caret when items change significantly
  useEffect(() => {
    setCaretToEnd();
  }, [cleanContent, setCaretToEnd]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Alt+Arrow combinations
      if (!e.altKey) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveCaretUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveCaretDown();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveCaretOut();
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveCaretIn();
          break;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [moveCaretUp, moveCaretDown, moveCaretIn, moveCaretOut]);

  // Handle item click from preview
  const handleItemClick = useCallback(
    (item: KnotContentItem, _index: number) => {
      setSelectedItemId(item.id);
      setCaretAfterItem(item.id);
    },
    [setCaretAfterItem]
  );

  // Handle adding a text message (Enter key)
  const handleAddText = useCallback(
    (text: string) => {
      const position = getInsertPosition();
      addTextMessageAt(text, position);
      // Move caret after new item
      setCaret((prev) => ({
        ...prev,
        afterIndex: prev.afterIndex + 1,
      }));
    },
    [addTextMessageAt, getInsertPosition, setCaret]
  );

  // Handle adding a choice (Alt+Enter key)
  const handleAddChoice = useCallback(
    (text: string) => {
      const position = getInsertPosition();
      const newItem = { type: 'choice' as const, text, isSticky: false };
      const newId = addItemAt('choice', position);
      // Update the choice text
      updateItem(newId, { text });
      // Move caret after new item
      setCaret((prev) => ({
        ...prev,
        afterIndex: prev.afterIndex + 1,
      }));
    },
    [addItemAt, updateItem, getInsertPosition, setCaret]
  );

  // Handle adding special content (from "+" menu)
  const handleAddSpecial = useCallback(
    (type: KnotContentItemType) => {
      const position = getInsertPosition();
      const newItemId = addItemAt(type, position);

      // Move caret after new item
      setCaret((prev) => ({
        ...prev,
        afterIndex: prev.afterIndex + 1,
      }));

      // If this type needs configuration, open the editor immediately
      if (TYPES_NEEDING_CONFIG.includes(type)) {
        setSelectedItemId(newItemId);
      }
    },
    [addItemAt, getInsertPosition, setCaret]
  );

  // Handle item update from editor
  const handleItemUpdate = useCallback(
    (updates: Partial<KnotContentItem>) => {
      if (selectedItemId) {
        updateItem(selectedItemId, updates);
      }
    },
    [selectedItemId, updateItem]
  );

  // Handle item delete
  const handleItemDelete = useCallback(() => {
    if (selectedItemId) {
      deleteItem(selectedItemId);
      setSelectedItemId(null);
      // Adjust caret if needed
      setCaret((prev) => ({
        ...prev,
        afterIndex: Math.max(-1, prev.afterIndex - 1),
      }));
    }
  }, [selectedItemId, deleteItem, setCaret]);

  // Handle move up
  const handleMoveUp = useCallback(() => {
    if (selectedItemId) {
      moveItemUp(selectedItemId);
    }
  }, [selectedItemId, moveItemUp]);

  // Handle move down
  const handleMoveDown = useCallback(() => {
    if (selectedItemId) {
      moveItemDown(selectedItemId);
    }
  }, [selectedItemId, moveItemDown]);

  // Handle apply changes
  const handleApply = useCallback(() => {
    const newContent = serialize();
    onUpdate(newContent);
  }, [serialize, onUpdate]);

  // Handle cancel/reset
  const handleCancel = useCallback(() => {
    reset();
    setSelectedItemId(null);
  }, [reset]);

  // Close editor panel
  const handleCloseEditor = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  // Get validation error for selected item
  const selectedItemError = useMemo(() => {
    if (!selectedItemId) return undefined;
    return validationErrors.find((e) => e.itemId === selectedItemId);
  }, [selectedItemId, validationErrors]);

  // Find index of selected item in flat list
  const selectedFlatIndex = useMemo(
    () => flatItems.findIndex((fi) => fi.item.id === selectedItemId),
    [flatItems, selectedItemId]
  );

  // Get friendly type name for editor header
  const getTypeName = (type: string): string => {
    const names: Record<string, string> = {
      'text': 'Text Message',
      'image': 'NPC Image',
      'player-image': 'Player Image',
      'video': 'NPC Video',
      'player-video': 'Player Video',
      'fake-type': 'Typing Indicator',
      'wait': 'Wait/Pause',
      'side-story': 'Side Story',
      'transition': 'Transition',
      'flag-operation': 'Flag Operation',
      'choice': 'Choice',
      'divert': 'Divert',
      'conditional': 'Conditional',
      'raw': 'Raw Ink',
    };
    return names[type] || type;
  };

  // Build breadcrumb for caret location
  const caretBreadcrumb = useMemo(() => {
    if (caret.parentId === null) {
      return 'Root';
    }
    // Find parent choice
    const parent = flatItems.find((fi) => fi.item.id === caret.parentId);
    if (parent && parent.item.type === 'choice') {
      const choiceText = parent.item.text || '(choice)';
      return `Inside: "${choiceText.slice(0, 20)}${choiceText.length > 20 ? '...' : ''}"`;
    }
    return 'Nested';
  }, [caret.parentId, flatItems]);

  return (
    <div className="knot-visual-editor" ref={containerRef} tabIndex={0}>
      {/* Main content area - preview/composer and sidebar side by side */}
      <div className="knot-visual-editor__main">
        {/* Left side - preview and composer */}
        <div className="knot-visual-editor__content">
          {/* Preview Area */}
          <div className="knot-visual-editor__preview">
            <PreviewRenderer
              items={items}
              projectPath={projectPath}
              mode="edit"
              onItemClick={handleItemClick}
              selectedItemId={selectedItemId}
              caret={caret}
            />
          </div>

          {/* Caret Location Indicator */}
          <div className="knot-visual-editor__caret-info">
            <span className="knot-visual-editor__caret-location">
              {isInsideChoice && <span className="knot-visual-editor__nested-badge">Nested</span>}
              {caretBreadcrumb}
            </span>
            <span className="knot-visual-editor__caret-hint">
              <kbd>Alt</kbd>+<kbd>Arrows</kbd> to navigate
            </span>
          </div>

          {/* Message Composer */}
          <MessageComposer
            onAddText={handleAddText}
            onAddChoice={handleAddChoice}
            onAddSpecial={handleAddSpecial}
            hasErrors={validationErrors.length > 0}
            placeholder={isInsideChoice ? "Add nested content..." : "Type a message... (Enter to send)"}
          />
        </div>

        {/* Item Editor Sidebar */}
        {selectedItem && (
          <div className="knot-visual-editor__sidebar">
            <div className="knot-visual-editor__sidebar-header">
              <h4>{getTypeName(selectedItem.type)}</h4>
              <button
                className="knot-visual-editor__close-btn"
                onClick={handleCloseEditor}
                title="Close (Escape)"
              >
                &times;
              </button>
            </div>

            <ContentItemEditor
              item={selectedItem}
              onChange={handleItemUpdate}
              onDelete={handleItemDelete}
              onMoveUp={selectedFlatIndex > 0 ? handleMoveUp : undefined}
              onMoveDown={
                selectedFlatIndex < flatItems.length - 1 ? handleMoveDown : undefined
              }
              projectPath={projectPath}
              availableKnots={availableKnots}
              availableFlags={availableFlags}
              error={selectedItemError?.message}
            />
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="knot-visual-editor__actions">
        {validationErrors.length > 0 && (
          <span className="knot-visual-editor__error-count">
            {validationErrors.length} error
            {validationErrors.length > 1 ? 's' : ''}
          </span>
        )}
        <div className="knot-visual-editor__buttons">
          <button
            className="ink-btn ink-btn-secondary"
            onClick={handleCancel}
            disabled={!isDirty}
          >
            Reset
          </button>
          <button
            className="ink-btn ink-btn-primary"
            onClick={handleApply}
            disabled={!isDirty || validationErrors.length > 0}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default KnotVisualEditor;
