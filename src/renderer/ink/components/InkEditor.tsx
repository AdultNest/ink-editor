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
import HistoryPanel from './HistoryPanel';
import LayoutMenu from './LayoutMenu';
import ConversationPanel from './ConversationPanel';
import { conversationService, type ConversationState } from '../ai/conversationService';
import type { AppSettings } from '../../../preload';
import {
  loadConversationMeta,
  loadCharacterConfig,
  findMainCharacter,
  type CharacterAIConfig,
  type ConversationMeta,
} from '../ai/characterConfig';
import { promptLibraryService, type ProjectPromptLibrary } from '../../services';

import './InkEditor.css';

export interface InkEditorProps {
  /** The path to the .ink file */
  filePath: string;
  /** The file name for display */
  fileName: string;
  /** Callback when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Application settings for AI features */
  appSettings?: AppSettings;
}

/** Handle exposed by InkEditor for parent components */
export interface InkEditorHandle {
  save: () => Promise<void>;
  isDirty: boolean;
}

export const InkEditor = forwardRef<InkEditorHandle, InkEditorProps>(function InkEditor(
  { filePath, fileName, onDirtyChange, appSettings },
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
    // History
    canUndo,
    canRedo,
    historyTreeView,
    currentHistoryNodeId,
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
    // History actions
    undo,
    redo,
    jumpToHistory,
  } = useInkEditor(filePath, {
    maxHistoryLength: appSettings?.editor?.maxHistoryLength,
  });

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

  // History panel state
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // AI Conversation panel state
  const [showConversationPanel, setShowConversationPanel] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<ConversationState['status']>('idle');
  const [continueFromKnot, setContinueFromKnot] = useState<{ name: string; content: string } | null>(null);

  // Handle opening AI panel from knot detail with "continue from" context
  const handleOpenAIPanel = useCallback((knotName: string, knotContent: string) => {
    setContinueFromKnot({ name: knotName, content: knotContent });
    setShowConversationPanel(true);
  }, []);

  // Clear continue-from context after it's been consumed
  const handleContinueFromConsumed = useCallback(() => {
    setContinueFromKnot(null);
  }, []);

  // Subscribe to conversation service state changes
  useEffect(() => {
    const unsubscribe = conversationService.subscribe((state) => {
      setConversationStatus(state.status);
    });
    return unsubscribe;
  }, []);

  // Subscribe to content changes from AI assistant
  // When AI modifies the file, update the editor content (without writing to disk)
  useEffect(() => {
    const unsubscribe = conversationService.subscribeToContentChanges((changedFilePath, content) => {
      // Only update if this is the file we're editing
      if (changedFilePath === filePath) {
        console.log('[InkEditor] Received content change from AI, updating editor');
        setRawContent(content);
      }
    });
    return unsubscribe;
  }, [filePath, setRawContent]);

  // Respond to content requests from AI assistant
  // When AI needs to read the current content, provide it from the editor (not disk)
  // Use a ref to always have access to the latest rawContent without re-subscribing
  const rawContentRef = useRef(rawContent);
  rawContentRef.current = rawContent;

  useEffect(() => {
    const unsubscribe = window.electronAPI.onConversationContentRequest((requestId, requestedFilePath) => {
      // Only respond if this is the file we're editing
      if (requestedFilePath === filePath) {
        console.log('[InkEditor] Responding to content request from AI');
        window.electronAPI.respondToContentRequest(requestId, rawContentRef.current);
      } else {
        // Not our file - respond with null so it falls back to disk
        window.electronAPI.respondToContentRequest(requestId, null);
      }
    });
    return unsubscribe;
  }, [filePath]);

  // Prompt library state
  const [promptLibrary, setPromptLibrary] = useState<ProjectPromptLibrary | null>(null);

  // Project root path (where Images/Videos folders are located)
  const [projectRoot, setProjectRoot] = useState<string>('');

  // Character AI configuration
  const [conversationMeta, setConversationMeta] = useState<ConversationMeta | null>(null);
  const [characterConfig, setCharacterConfig] = useState<CharacterAIConfig | null>(null);
  const [mainCharacterConfig, setMainCharacterConfig] = useState<CharacterAIConfig | null>(null);
  const [settingsFileReady, setSettingsFileReady] = useState(false);

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

  // Ensure settings file exists when opening a .ink file
  useEffect(() => {
    let isMounted = true;

    async function ensureSettingsFile() {
      setSettingsFileReady(false);

      if (!filePath || !filePath.toLowerCase().endsWith('.ink')) {
        if (isMounted) setSettingsFileReady(true);
        return;
      }

      try {
        // Get the settings file path
        const settingsPath = filePath.replace(/\.ink$/i, '-settings.json');

        // Check if it exists
        const exists = await window.electronAPI.fileExists(settingsPath);
        if (exists) {
          console.log('[InkEditor] Settings file exists:', settingsPath);
          if (isMounted) setSettingsFileReady(true);
          return;
        }

        // Create the settings file with default content
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const fileName = filePath.split(pathSeparator).pop() || '';
        const baseName = fileName.replace(/\.ink$/i, '');

        const settingsContent = JSON.stringify({
          storyId: baseName,
          contactID: '',
          nextStoryId: '',
          isStartingStory: false,
          forceTimeInHours: 12,
          passTimeInMinutes: 0,
          timeIsExact: false,
          forceDay: 0,
          isSideStory: false,
        }, null, 2);

        await window.electronAPI.createFile(settingsPath, settingsContent);
        console.log('[InkEditor] Created settings file:', settingsPath);
      } catch (err) {
        console.error('[InkEditor] Failed to ensure settings file:', err);
      }

      if (isMounted) setSettingsFileReady(true);
    }

    ensureSettingsFile();

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  // Load conversation metadata from paired JSON file (after settings file is ready)
  useEffect(() => {
    async function loadConvoMeta() {
      if (!filePath || !settingsFileReady) return;

      const meta = await loadConversationMeta(filePath);
      setConversationMeta(meta);
      console.log('[InkEditor] Loaded conversation meta:', meta);
    }

    loadConvoMeta();
  }, [filePath, settingsFileReady]);

  // Load character AI config when we have projectRoot and conversationMeta
  useEffect(() => {
    async function loadCharConfig() {
      if (!projectRoot || !conversationMeta?.contactID) {
        setCharacterConfig(null);
        return;
      }

      const config = await loadCharacterConfig(projectRoot, conversationMeta.contactID);
      setCharacterConfig(config);
      console.log('[InkEditor] Loaded character config:', config);
    }

    loadCharConfig();
  }, [projectRoot, conversationMeta]);

  // Load main character config (for player images)
  useEffect(() => {
    async function loadMainChar() {
      if (!projectRoot) {
        setMainCharacterConfig(null);
        return;
      }

      const config = await findMainCharacter(projectRoot);
      setMainCharacterConfig(config);
      console.log('[InkEditor] Loaded main character config:', config);
    }

    loadMainChar();
  }, [projectRoot]);

  // Load prompt library when project root is available
  useEffect(() => {
    async function loadLibrary() {
      if (!projectRoot) {
        setPromptLibrary(null);
        return;
      }

      try {
        const library = await promptLibraryService.loadLibrary(projectRoot);
        setPromptLibrary(library);
        console.log('[InkEditor] Loaded prompt library');
      } catch (err) {
        console.error('[InkEditor] Failed to load prompt library:', err);
        setPromptLibrary(null);
      }
    }

    loadLibrary();
  }, [projectRoot]);

  // Ensure ComfyUI workflow file exists when project is opened and ComfyUI is enabled
  useEffect(() => {
    async function ensureWorkflow() {
      if (!projectRoot || !appSettings?.comfyui?.enabled) {
        return;
      }

      console.log('[InkEditor] Ensuring ComfyUI workflow files exist...');
      const result = await window.electronAPI.ensureComfyUIWorkflow(projectRoot);

      if (result.success) {
        if (result.created.length > 0) {
          console.log('[InkEditor] Created default ComfyUI workflow files:', result.created.join(', '));
        }
        console.log('[InkEditor] ComfyUI workflow files:', result.paths.preview, result.paths.render);
      } else {
        console.error('[InkEditor] Failed to ensure workflow files:', result.error);
      }
    }

    ensureWorkflow();
  }, [projectRoot, appSettings?.comfyui?.enabled]);

  // Load available methods from methods.conf
  useEffect(() => {
    async function loadAvailableMethods() {
      if (!filePath) return;

      try {
        // Find the project root by looking for methods.conf
        // Walk up the directory tree from the file path
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const pathParts = filePath.split(pathSeparator);

        // Try each parent directory until we find methods.conf
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const testPath = pathParts.slice(0, i + 1).join(pathSeparator);
          const configPath = `${testPath}${pathSeparator}methods.conf`;

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

        // No methods.conf found, use empty array
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

  // Check if AI is available
  const isAIAvailable = appSettings?.ollama?.enabled || false;

  // Handle AI-generated content
  const handleGeneratedContent = useCallback((inkContent: string) => {
    // Append the generated content to the existing raw content
    const newContent = rawContent.trim()
      ? `${rawContent}\n\n${inkContent}`
      : inkContent;
    setRawContent(newContent);
  }, [rawContent, setRawContent]);

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

          {/* History panel toggle (graph mode only) */}
          {viewMode === 'graph' && (
            <button
              className={`ink-btn ink-btn-history ${showHistoryPanel ? 'active' : ''}`}
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              title={`History (${historyTreeView.length})`}
            >
              History {historyTreeView.length > 1 && <span className="ink-history-count">{historyTreeView.length}</span>}
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

          {/* AI Assistant button (multi-turn conversation) */}
          {isAIAvailable && (
            <button
              className={`ink-btn ink-btn-ai ${conversationStatus !== 'idle' ? 'ink-btn-ai-active' : ''}`}
              onClick={() => setShowConversationPanel(true)}
              title={conversationStatus !== 'idle' ? 'AI Assistant (session active)' : 'AI Assistant (multi-turn conversation)'}
            >
              AI Assistant
              {(conversationStatus === 'thinking' || conversationStatus === 'executing_tools') && (
                <span className="ink-ai-indicator ink-ai-indicator-working" />
              )}
              {conversationStatus === 'active' && (
                <span className="ink-ai-indicator ink-ai-indicator-active" />
              )}
            </button>
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
          <div className={`ink-graph-layout ${showFlagsPanel ? 'with-flags-panel' : ''} ${showImportsPanel ? 'with-imports-panel' : ''} ${showHistoryPanel ? 'with-history-panel' : ''}`}>
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

            {/* History sidebar (left side) */}
            {showHistoryPanel && (
              <div className="ink-history-sidebar">
                <HistoryPanel
                  treeView={historyTreeView}
                  currentId={currentHistoryNodeId}
                  onNodeClick={jumpToHistory}
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
                  inkFilePath={filePath}
                  availableKnots={parsedInk?.knots.map(k => k.name) ?? []}
                  availableFlags={parsedInk?.allStoryFlags ?? []}
                  appSettings={appSettings}
                  characterConfig={characterConfig}
                  mainCharacterConfig={mainCharacterConfig}
                  promptLibrary={promptLibrary}
                  onAIGenerate={handleGeneratedContent}
                  onOpenAIPanel={handleOpenAIPanel}
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

      {/* AI Conversation panel */}
      {appSettings && (
        <ConversationPanel
          isOpen={showConversationPanel}
          onClose={() => setShowConversationPanel(false)}
          appSettings={appSettings}
          projectPath={projectRoot}
          inkFilePath={filePath}
          characterConfig={characterConfig}
          promptLibrary={promptLibrary}
          continueFromKnot={continueFromKnot}
          onContinueFromConsumed={handleContinueFromConsumed}
        />
      )}
    </div>
  );
});

export default InkEditor;
