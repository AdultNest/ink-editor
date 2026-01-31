/**
 * InkEditor component
 *
 * Main orchestrator for the ink editor, managing:
 * - View mode toggle (graph/raw)
 * - Toolbar with actions
 * - Graph view with detail panel
 * - Raw text editor
 */

import { useState, useCallback, useEffect, useImperativeHandle, forwardRef, useRef, useMemo } from 'react';
import { useInkEditor, type ViewMode } from '../hooks';
import { validateExternals, type InkParseError } from '../parser';
import InkNodeEditor from './InkNodeEditor';
import InkRawEditor from './InkRawEditor';
import InkNodeDetail from './InkNodeDetail';
import FlagsPanel from './FlagsPanel';
import ImportsPanel, { type AvailableMethod } from './ImportsPanel';
import LayoutMenu from './LayoutMenu';

import './InkEditor.css';

export interface InkEditorProps {
  /** The path to the .ink file */
  filePath: string;
  /** The file name for display */
  fileName: string;
  /** Callback when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

/** Handle exposed by InkEditor for parent components */
export interface InkEditorHandle {
  save: () => Promise<void>;
  isDirty: boolean;
}

export const InkEditor = forwardRef<InkEditorHandle, InkEditorProps>(function InkEditor(
  { filePath, fileName, onDirtyChange },
  ref
) {
  const {
    rawContent,
    parsedInk,
    viewMode,
    selectedKnotId,
    selectedKnot,
    isDirty,
    isLoading,
    error,
    isSaving,
    nodes,
    edges,
    setViewMode,
    setSelectedKnotId,
    setRawContent,
    updateKnot,
    addNewKnot,
    deleteSelectedKnot,
    addEdge,
    removeEdge,
    updateEdge,
    save,
    onNodesChange,
    onRegionMembershipChange,
    addNewRegion,
    renameKnotAction,
    renameRegionAction,
    applyLayout,
  } = useInkEditor(filePath);

  // Expose save and isDirty to parent via ref
  useImperativeHandle(ref, () => ({
    save,
    isDirty,
  }), [save, isDirty]);

  // Track previous dirty state to avoid unnecessary calls
  const prevDirtyRef = useRef<boolean | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Notify parent when dirty state changes (only when value actually changes)
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      onDirtyChangeRef.current?.(isDirty);
    }
  }, [isDirty]);

  // New knot dialog state
  const [showNewKnotDialog, setShowNewKnotDialog] = useState(false);
  const [newKnotName, setNewKnotName] = useState('');

  // Error panel state
  const [showErrors, setShowErrors] = useState(false);

  // Flags panel state
  const [showFlagsPanel, setShowFlagsPanel] = useState(false);

  // Imports panel state
  const [showImportsPanel, setShowImportsPanel] = useState(false);
  const [availableMethods, setAvailableMethods] = useState<AvailableMethod[]>([]);

  // Project root path (where Images/Videos folders are located)
  const [projectRoot, setProjectRoot] = useState<string>('');

  // Focus node function from InkNodeEditor (for navigation)
  const focusNodeRef = useRef<((nodeId: string) => void) | null>(null);

  // Register focus node function from InkNodeEditor
  const handleFocusNodeRegister = useCallback((focusNode: (nodeId: string) => void) => {
    focusNodeRef.current = focusNode;
  }, []);

  // Count story flags
  const flagCount = parsedInk?.allStoryFlags.length || 0;

  // Count imports
  const importsCount = parsedInk?.externals.length || 0;

  // Find project root by looking for Images or Videos folder
  useEffect(() => {
    async function findProjectRoot() {
      if (!filePath) return;

      try {
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const pathParts = filePath.split(pathSeparator);

        // Walk up the directory tree looking for Images or Videos folder
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const testPath = pathParts.slice(0, i + 1).join(pathSeparator);
          const imagesPath = `${testPath}${pathSeparator}Images`;
          const videosPath = `${testPath}${pathSeparator}Videos`;

          try {
            const imagesExists = await window.electronAPI.fileExists(imagesPath);
            const videosExists = await window.electronAPI.fileExists(videosPath);
            if (imagesExists || videosExists) {
              setProjectRoot(testPath);
              return;
            }
          } catch {
            // Continue searching
          }
        }

        // Fallback: use parent of file's directory
        pathParts.pop(); // Remove filename
        setProjectRoot(pathParts.join(pathSeparator));
      } catch {
        // Fallback
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const pathParts = filePath.split(pathSeparator);
        pathParts.pop();
        setProjectRoot(pathParts.join(pathSeparator));
      }
    }

    findProjectRoot();
  }, [filePath]);

  // Load available methods from methods.conf.json
  useEffect(() => {
    async function loadAvailableMethods() {
      if (!filePath) return;

      try {
        // Find the project root by looking for methods.conf.json
        // Walk up the directory tree from the file path
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const pathParts = filePath.split(pathSeparator);

        // Try each parent directory until we find methods.conf.json
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const testPath = pathParts.slice(0, i + 1).join(pathSeparator);
          const configPath = `${testPath}${pathSeparator}methods.conf.json`;

          try {
            const exists = await window.electronAPI.fileExists(configPath);
            if (exists) {
              const content = await window.electronAPI.readFile(configPath);
              const config = JSON.parse(content);
              if (config.availableMethods && Array.isArray(config.availableMethods)) {
                setAvailableMethods(config.availableMethods);
              }
              return;
            }
          } catch {
            // Continue searching
          }
        }

        // No methods.conf.json found, use empty array
        setAvailableMethods([]);
      } catch {
        setAvailableMethods([]);
      }
    }

    loadAvailableMethods();
  }, [filePath]);

  // Handle adding a new knot
  const handleAddKnot = useCallback(() => {
    if (newKnotName.trim()) {
      addNewKnot(newKnotName.trim());
      setNewKnotName('');
      setShowNewKnotDialog(false);
    }
  }, [newKnotName, addNewKnot]);

  // Handle context menu add knot (with position from right-click)
  const handleKnotCreate = useCallback((name: string, x: number, y: number) => {
    addNewKnot(name, x, y);
  }, [addNewKnot]);

  // State for new region dialog (toolbar button)
  const [showNewRegionDialog, setShowNewRegionDialog] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');

  // Handle adding a new region from toolbar
  const handleAddRegion = useCallback(() => {
    if (newRegionName.trim()) {
      // Use default position for toolbar-created regions
      addNewRegion(newRegionName.trim(), 400, 200);
      setNewRegionName('');
      setShowNewRegionDialog(false);
    }
  }, [newRegionName, addNewRegion]);

  // Handle node deletion
  const handleNodeDelete = useCallback((nodeId: string) => {
    if (nodeId === selectedKnotId) {
      setSelectedKnotId(null);
    }
    // Find the knot and delete it
    const knot = parsedInk?.knots.find(k => k.name === nodeId);
    if (knot) {
      // Use the deleteSelectedKnot logic but for a specific knot
      setSelectedKnotId(nodeId);
      setTimeout(() => {
        deleteSelectedKnot();
      }, 0);
    }
  }, [selectedKnotId, parsedInk, setSelectedKnotId, deleteSelectedKnot]);

  // Handle adding an EXTERNAL import
  const handleAddImport = useCallback((method: AvailableMethod) => {
    // Create the EXTERNAL declaration line
    const externalLine = `EXTERNAL ${method.name}(${method.params.join(', ')})`;

    // Find the best position to insert the EXTERNAL declaration
    // Insert after any existing EXTERNAL declarations, or at the beginning of the file
    const lines = rawContent.split('\n');
    let insertIndex = 0;

    // Find the last EXTERNAL declaration
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('EXTERNAL ')) {
        insertIndex = i + 1;
      } else if (lines[i].trim() && !lines[i].trim().startsWith('//')) {
        // Stop at the first non-empty, non-comment line that isn't an EXTERNAL
        if (insertIndex === 0) {
          // No EXTERNAL declarations found, insert at the beginning
          break;
        }
        break;
      }
    }

    // Insert the new EXTERNAL declaration
    lines.splice(insertIndex, 0, externalLine);
    setRawContent(lines.join('\n'));
  }, [rawContent, setRawContent]);

  // Handle removing an EXTERNAL import
  const handleRemoveImport = useCallback((methodName: string) => {
    if (!parsedInk) return;

    // Find the EXTERNAL declaration for this method
    const external = parsedInk.externals.find(e => e.name === methodName);
    if (!external) return;

    // Remove the line containing the EXTERNAL declaration
    const lines = rawContent.split('\n');
    const lineIndex = external.lineNumber - 1; // lineNumber is 1-based

    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines.splice(lineIndex, 1);
      setRawContent(lines.join('\n'));
    }
  }, [parsedInk, rawContent, setRawContent]);

  // Combine parser errors with external validation errors
  const allErrors = useMemo(() => {
    if (!parsedInk) return [];

    const parserErrors = parsedInk.errors;
    const externalErrors = validateExternals(parsedInk, availableMethods);

    return [...parserErrors, ...externalErrors];
  }, [parsedInk, availableMethods]);

  // Count errors
  const errorCount = allErrors.filter(e => e.severity === 'error').length;
  const warningCount = allErrors.filter(e => e.severity === 'warning').length;

  // Loading state
  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="content-view content-view-error">
        <span className="content-view-error-icon">!</span>
        <span className="content-view-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="content-view ink-editor">
      {/* Toolbar */}
      <div className="ink-editor-toolbar">
        <div className="ink-editor-tabs">
          <button
            className={`ink-editor-tab ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => setViewMode('graph')}
          >
            Graph
          </button>
          <button
            className={`ink-editor-tab ${viewMode === 'raw' ? 'active' : ''}`}
            onClick={() => setViewMode('raw')}
          >
            Raw
          </button>
        </div>

        <div className="ink-editor-actions">
          {/* Imports panel toggle (graph mode only) */}
          {viewMode === 'graph' && (
            <button
              className={`ink-btn ink-btn-imports ${showImportsPanel ? 'active' : ''}`}
              onClick={() => setShowImportsPanel(!showImportsPanel)}
              title={`Imports (${importsCount})`}
            >
              Imports {importsCount > 0 && <span className="ink-imports-count">{importsCount}</span>}
            </button>
          )}

          {/* Flags panel toggle (graph mode only) */}
          {viewMode === 'graph' && (
            <button
              className={`ink-btn ink-btn-flags ${showFlagsPanel ? 'active' : ''}`}
              onClick={() => setShowFlagsPanel(!showFlagsPanel)}
              title={`Story Flags (${flagCount})`}
            >
              Flags {flagCount > 0 && <span className="ink-flags-count">{flagCount}</span>}
            </button>
          )}

          {/* Error/warning badge */}
          {(errorCount > 0 || warningCount > 0) && (
            <button
              className={`ink-editor-error-badge ${errorCount > 0 ? 'has-errors' : 'has-warnings'}`}
              onClick={() => setShowErrors(!showErrors)}
              title={`${errorCount} error(s), ${warningCount} warning(s)`}
            >
              {errorCount > 0 && <span className="ink-error-count">{errorCount}</span>}
              {warningCount > 0 && <span className="ink-warning-count">{warningCount}</span>}
            </button>
          )}

          {/* Dirty indicator */}
          {isDirty && <span className="ink-editor-dirty">Modified</span>}

          {/* Add knot button (graph mode only) */}
          {viewMode === 'graph' && (
            <button
              className="ink-btn"
              onClick={() => setShowNewKnotDialog(true)}
              title="Add new knot"
            >
              + Knot
            </button>
          )}

          {/* Add region/group button (graph mode only) */}
          {viewMode === 'graph' && (
            <button
              className="ink-btn"
              onClick={() => setShowNewRegionDialog(true)}
              title="Add new region/group"
            >
              + Group
            </button>
          )}

          {/* Layout dropdown (graph mode only) */}
          {viewMode === 'graph' && (
            <LayoutMenu
              onLayout={applyLayout}
              disabled={!parsedInk || parsedInk.knots.length === 0}
            />
          )}

          {/* Save button */}
          <button
            className="ink-btn ink-btn-primary"
            onClick={save}
            disabled={!isDirty || isSaving}
            title="Save (Ctrl+S)"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <span className="ink-editor-filename">{fileName}</span>
      </div>

      {/* Error panel */}
      {showErrors && allErrors.length > 0 && (
        <div className="ink-error-panel">
          <div className="ink-error-panel-header">
            <span>Problems</span>
            <button onClick={() => setShowErrors(false)}>&times;</button>
          </div>
          <div className="ink-error-panel-content">
            {allErrors.map((err, i) => (
              <div
                key={i}
                className={`ink-error-item ink-error-${err.severity}`}
              >
                <span className="ink-error-line">Line {err.lineNumber}</span>
                <span className="ink-error-message">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="ink-editor-content">
        {viewMode === 'graph' ? (
          <div className={`ink-graph-layout ${showFlagsPanel ? 'with-flags-panel' : ''} ${showImportsPanel ? 'with-imports-panel' : ''}`}>
            {/* Imports sidebar (left side, before flags) */}
            {showImportsPanel && (
              <div className="ink-imports-sidebar">
                <ImportsPanel
                  parsedInk={parsedInk}
                  availableMethods={availableMethods}
                  onImportClick={(name, lineNumber) => {
                    // Navigate to the line in raw view
                    setViewMode('raw');
                  }}
                  onAddImport={handleAddImport}
                  onRemoveImport={handleRemoveImport}
                />
              </div>
            )}

            {/* Flags sidebar (left side) */}
            {showFlagsPanel && (
              <div className="ink-flags-sidebar">
                <FlagsPanel
                  parsedInk={parsedInk}
                  selectedKnotId={selectedKnotId}
                  onFlagClick={(flagName, lineNumber) => {
                    // Find the knot containing this flag and select it
                    const knot = parsedInk?.knots.find(k =>
                      k.storyFlags.some(f => f.name === flagName && f.lineNumber === lineNumber)
                    );
                    if (knot) {
                      setSelectedKnotId(knot.name);
                      // Focus on the node (zoom and center)
                      focusNodeRef.current?.(knot.name);
                    }
                  }}
                />
              </div>
            )}

            {/* Main graph area */}
            <div className={`ink-graph-main ${selectedKnot ? 'with-panel' : ''}`}>
              <InkNodeEditor
                initialNodes={nodes}
                initialEdges={edges}
                onNodeSelect={setSelectedKnotId}
                onEdgeCreate={addEdge}
                onEdgeDelete={removeEdge}
                onEdgeUpdate={updateEdge}
                onNodeDelete={handleNodeDelete}
                onNodesChange={onNodesChange}
                onRegionMembershipChange={onRegionMembershipChange}
                onRegionCreate={addNewRegion}
                onKnotCreate={handleKnotCreate}
                onKnotRename={renameKnotAction}
                onRegionRename={renameRegionAction}
                existingKnotNames={parsedInk?.knots.map(k => k.name) || []}
                existingRegionNames={parsedInk?.regions.map(r => r.name) || []}
                onFocusNodeRegister={handleFocusNodeRegister}
              />
            </div>

            {/* Detail panel (right side) */}
            {selectedKnot && (
              <div className="ink-graph-panel">
                <InkNodeDetail
                  knot={selectedKnot}
                  onUpdate={(content) => updateKnot(selectedKnot.name, content)}
                  onClose={() => setSelectedKnotId(null)}
                  projectPath={projectRoot}
                  availableKnots={parsedInk?.knots.map(k => k.name) ?? []}
                  availableFlags={parsedInk?.allStoryFlags ?? []}
                />
              </div>
            )}
          </div>
        ) : (
          <InkRawEditor
            content={rawContent}
            errors={allErrors}
            onChange={setRawContent}
          />
        )}
      </div>

      {/* New knot dialog */}
      {showNewKnotDialog && (() => {
        const knotNameTrimmed = newKnotName.trim();
        const isValidFormat = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(knotNameTrimmed);
        const existingKnotNames = parsedInk?.knots.map(k => k.name) || [];
        const isDuplicate = existingKnotNames.includes(knotNameTrimmed);
        const canSubmit = knotNameTrimmed && isValidFormat && !isDuplicate;

        return (
          <div className="ink-dialog-overlay" onClick={() => setShowNewKnotDialog(false)}>
            <div className="ink-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="ink-dialog-header">
                <h3>Add New Knot</h3>
                <button onClick={() => setShowNewKnotDialog(false)}>&times;</button>
              </div>
              <div className="ink-dialog-content">
                <label className="ink-dialog-label">
                  Knot Name
                  <input
                    type="text"
                    className={`ink-dialog-input ${isDuplicate ? 'ink-dialog-input-error' : ''}`}
                    value={newKnotName}
                    onChange={(e) => setNewKnotName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSubmit) handleAddKnot();
                      if (e.key === 'Escape') setShowNewKnotDialog(false);
                    }}
                    placeholder="e.g., my_new_knot"
                    autoFocus
                    pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                  />
                </label>
                {isDuplicate ? (
                  <p className="ink-dialog-error">
                    A knot named "{knotNameTrimmed}" already exists.
                  </p>
                ) : (
                  <p className="ink-dialog-hint">
                    Use letters, numbers, and underscores. Must start with a letter or underscore.
                  </p>
                )}
              </div>
              <div className="ink-dialog-actions">
                <button
                  className="ink-btn ink-btn-secondary"
                  onClick={() => setShowNewKnotDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="ink-btn ink-btn-primary"
                  onClick={handleAddKnot}
                  disabled={!canSubmit}
                >
                  Add Knot
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New region/group dialog */}
      {showNewRegionDialog && (
        <div className="ink-dialog-overlay" onClick={() => setShowNewRegionDialog(false)}>
          <div className="ink-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ink-dialog-header">
              <h3>Add New Group</h3>
              <button onClick={() => setShowNewRegionDialog(false)}>&times;</button>
            </div>
            <div className="ink-dialog-content">
              <label className="ink-dialog-label">
                Group Name
                <input
                  type="text"
                  className="ink-dialog-input"
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRegion();
                    if (e.key === 'Escape') setShowNewRegionDialog(false);
                  }}
                  placeholder="e.g., Introduction, Main Story"
                  autoFocus
                />
              </label>
              <p className="ink-dialog-hint">
                Groups help organize related knots together. Drag knots into a group to organize your story.
              </p>
            </div>
            <div className="ink-dialog-actions">
              <button
                className="ink-btn ink-btn-secondary"
                onClick={() => setShowNewRegionDialog(false)}
              >
                Cancel
              </button>
              <button
                className="ink-btn ink-btn-primary"
                onClick={handleAddRegion}
                disabled={!newRegionName.trim()}
              >
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default InkEditor;
