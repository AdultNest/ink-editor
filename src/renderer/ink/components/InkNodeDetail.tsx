/**
 * InkNodeDetail component
 *
 * Detail panel shown when a knot is selected.
 * Provides three modes:
 * - Visual: Chat-like visual editor for non-technical users
 * - Code: Raw ink syntax editing (original behavior)
 * - Preview: Read-only chat preview
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { InkKnot, InkChoice, InkDivert } from '../parser/inkTypes';
import { stripPositionComment } from '../parser/inkGenerator';
import { parseKnotContent } from '../parser/knotContentParser';
import { KnotVisualEditor } from './KnotVisualEditor';
import { PreviewRenderer } from '../preview';

import './InkEditor.css';

/** Editor mode type */
type EditorMode = 'visual' | 'code' | 'preview';

/** Storage key for remembering user's preferred mode */
const MODE_STORAGE_KEY = 'ink-editor-detail-mode';

export interface InkNodeDetailProps {
  /** The selected knot */
  knot: InkKnot;
  /** Callback when the knot content is updated */
  onUpdate: (newBodyContent: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Project path for media resolution */
  projectPath?: string;
  /** Available knot names for divert autocomplete */
  availableKnots?: string[];
  /** Available flag names for autocomplete */
  availableFlags?: string[];
}

/**
 * Render a choice item (used in Code mode)
 */
function ChoiceItem({ choice }: { choice: InkChoice }) {
  return (
    <div className="ink-detail-choice">
      <span className="ink-detail-choice-type">
        {choice.isSticky ? '+' : '*'}
      </span>
      <span className="ink-detail-choice-text">{choice.text}</span>
      {choice.divert && (
        <span className="ink-detail-choice-divert">
          {'->'} {choice.divert}
        </span>
      )}
    </div>
  );
}

/**
 * Render a divert item (used in Code mode)
 */
function DivertItem({ divert }: { divert: InkDivert }) {
  const label = divert.context === 'choice' && divert.choiceText
    ? `${divert.choiceText} -> ${divert.target}`
    : divert.target;

  return (
    <span className="ink-detail-divert-tag" title={`Line ${divert.lineNumber}`}>
      {divert.context === 'choice' ? '* ' : '-> '}
      {label}
    </span>
  );
}

/**
 * Code mode content editor (original behavior)
 */
function CodeModeEditor({
  knot,
  displayContent,
  onUpdate,
}: {
  knot: InkKnot;
  displayContent: string;
  onUpdate: (content: string) => void;
}) {
  const [editContent, setEditContent] = useState(displayContent);
  const [isEditing, setIsEditing] = useState(false);

  // Update edit content when knot changes
  useEffect(() => {
    setEditContent(displayContent);
    setIsEditing(false);
  }, [displayContent]);

  const handleSave = useCallback(() => {
    onUpdate(editContent);
    setIsEditing(false);
  }, [editContent, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditContent(displayContent);
    setIsEditing(false);
  }, [displayContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSave();
    }
  }, [handleCancel, handleSave]);

  // Get unique divert targets for display
  const uniqueDiverts = useMemo(() => {
    const seen = new Set<string>();
    return knot.diverts.filter(d => {
      if (seen.has(d.target)) return false;
      seen.add(d.target);
      return true;
    });
  }, [knot.diverts]);

  return (
    <>
      {/* Choices section */}
      {knot.choices.length > 0 && (
        <div className="ink-detail-section">
          <h4 className="ink-detail-section-title">
            Choices ({knot.choices.length})
          </h4>
          <div className="ink-detail-choices">
            {knot.choices.map((choice, i) => (
              <ChoiceItem key={i} choice={choice} />
            ))}
          </div>
        </div>
      )}

      {/* Diverts section */}
      {uniqueDiverts.length > 0 && (
        <div className="ink-detail-section">
          <h4 className="ink-detail-section-title">
            Diverts to ({uniqueDiverts.length})
          </h4>
          <div className="ink-detail-diverts">
            {uniqueDiverts.map((divert, i) => (
              <DivertItem key={i} divert={divert} />
            ))}
          </div>
        </div>
      )}

      {/* Content editor */}
      <div className="ink-detail-section">
        <div className="ink-detail-section-header">
          <h4 className="ink-detail-section-title">Content</h4>
          {!isEditing && (
            <button
              className="ink-detail-edit-btn"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="ink-detail-editor">
            <textarea
              className="ink-detail-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
            />
            <div className="ink-detail-editor-actions">
              <button
                className="ink-btn ink-btn-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="ink-btn ink-btn-primary"
                onClick={handleSave}
              >
                Apply (Ctrl+Enter)
              </button>
            </div>
          </div>
        ) : (
          <pre className="ink-detail-code">{displayContent || '(empty)'}</pre>
        )}
      </div>

      {/* Meta info */}
      <div className="ink-detail-meta">
        <span>Lines {knot.lineStart} - {knot.lineEnd}</span>
        {knot.position && (
          <span> | Position: ({knot.position.x.toFixed(0)}, {knot.position.y.toFixed(0)})</span>
        )}
      </div>
    </>
  );
}

export function InkNodeDetail({
  knot,
  onUpdate,
  onClose,
  projectPath = '',
  availableKnots = [],
  availableFlags = [],
}: InkNodeDetailProps) {
  // Load saved mode preference
  const [mode, setMode] = useState<EditorMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    return (saved as EditorMode) || 'visual';
  });

  // Save mode preference when it changes
  const handleModeChange = useCallback((newMode: EditorMode) => {
    setMode(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
  }, []);

  // Strip position comment from content for display/editing
  const displayContent = useMemo(
    () => stripPositionComment(knot.bodyContent),
    [knot.bodyContent]
  );

  // Parse content for preview mode
  const previewItems = useMemo(
    () => parseKnotContent(displayContent),
    [displayContent]
  );

  // Reset mode when switching knots if needed
  useEffect(() => {
    // Could reset to visual mode on knot change, but we keep the user's preference
  }, [knot.name]);

  return (
    <div className="ink-detail-panel">
      {/* Header with tabs */}
      <div className="ink-detail-header">
        <h3 className="ink-detail-title">=== {knot.name} ===</h3>
        <button
          className="ink-detail-close"
          onClick={onClose}
          title="Close panel (Escape)"
        >
          &times;
        </button>
      </div>

      {/* Mode tabs */}
      <div className="ink-detail-tabs">
        <button
          className={`ink-detail-tab ${mode === 'visual' ? 'ink-detail-tab--active' : ''}`}
          onClick={() => handleModeChange('visual')}
        >
          Visual
        </button>
        <button
          className={`ink-detail-tab ${mode === 'code' ? 'ink-detail-tab--active' : ''}`}
          onClick={() => handleModeChange('code')}
        >
          Code
        </button>
        <button
          className={`ink-detail-tab ${mode === 'preview' ? 'ink-detail-tab--active' : ''}`}
          onClick={() => handleModeChange('preview')}
        >
          Preview
        </button>
      </div>

      {/* Content based on mode */}
      <div className="ink-detail-content">
        {mode === 'visual' && (
          <KnotVisualEditor
            knot={knot}
            projectPath={projectPath}
            onUpdate={onUpdate}
            availableKnots={availableKnots}
            availableFlags={availableFlags}
          />
        )}

        {mode === 'code' && (
          <CodeModeEditor
            knot={knot}
            displayContent={displayContent}
            onUpdate={onUpdate}
          />
        )}

        {mode === 'preview' && (
          <div className="ink-detail-preview">
            <PreviewRenderer
              items={previewItems}
              projectPath={projectPath}
              mode="preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default InkNodeDetail;
