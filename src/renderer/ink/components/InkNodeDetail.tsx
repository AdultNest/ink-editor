/**
 * InkNodeDetail component
 *
 * Detail panel shown when a knot is selected.
 * Provides four modes:
 * - Visual: Chat-like visual editor for non-technical users
 * - Code: Raw ink syntax editing (original behavior)
 * - Preview: Read-only chat preview
 * - AI: Generate continuation from this knot
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { InkKnot, InkChoice, InkDivert } from '../parser/inkTypes';
import { stripPositionComment } from '../parser/inkGenerator';
import { parseKnotContent } from '../parser/knotContentParser';
import { KnotVisualEditor } from './KnotVisualEditor';
import { PreviewRenderer } from '../preview';
import { conversationService } from '../ai/conversationService';
import type { AppSettings } from '../../../preload';
import type { CharacterAIConfig } from '../ai/characterConfig';
import type { ProjectPromptLibrary } from '../../services/promptLibrary.types';

import './InkEditor.css';

/** Editor mode type */
type EditorMode = 'visual' | 'code' | 'preview' | 'ai';

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
  /** Path to the current ink file */
  inkFilePath?: string;
  /** Available knot names for divert autocomplete */
  availableKnots?: string[];
  /** Available flag names for autocomplete */
  availableFlags?: string[];
  /** Application settings for AI features */
  appSettings?: AppSettings;
  /** Character AI configuration for NPC images */
  characterConfig?: CharacterAIConfig | null;
  /** Main character AI configuration for player images */
  mainCharacterConfig?: CharacterAIConfig | null;
  /** Project prompt library */
  promptLibrary?: ProjectPromptLibrary | null;
  /** Callback when AI generates new content to append */
  onAIGenerate?: (inkContent: string, linkFromKnot: string) => void;
  /** Callback to open the AI Story Assistant panel with "continue from" context */
  onOpenAIPanel?: (knotName: string, knotContent: string) => void;
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

/**
 * AI Assistant mode - conversation-based generation from this knot
 */
function AIAssistantEditor({
  knot,
  displayContent,
  appSettings,
  characterConfig,
  projectPath,
  inkFilePath,
  promptLibrary,
}: {
  knot: InkKnot;
  displayContent: string;
  appSettings?: AppSettings;
  characterConfig?: CharacterAIConfig | null;
  projectPath: string;
  inkFilePath: string;
  promptLibrary?: import('../../services/promptLibrary.types').ProjectPromptLibrary | null;
}) {
  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(15);
  const [userMessage, setUserMessage] = useState('');
  const [state, setState] = useState(() => conversationService.getState());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isEnabled = appSettings?.ollama?.enabled ?? false;
  const ollamaConfig = appSettings?.ollama;
  const isOllamaConfigured = ollamaConfig?.enabled && ollamaConfig?.baseUrl && ollamaConfig?.model;

  // Subscribe to conversation state changes
  useEffect(() => {
    const unsubscribe = conversationService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Goal examples specific to continuing from a knot
  const knotGoalExamples = [
    `Continue the conversation from "${knot.name}" with a romantic scene`,
    `Add player choices that branch the story from "${knot.name}"`,
    `Create a dramatic plot twist following "${knot.name}"`,
  ];

  // Handle starting a session with knot context
  const handleStart = useCallback(async () => {
    if (!goal.trim() || !isOllamaConfigured) return;

    // Include knot context in the goal
    const contextualGoal = `Continue from knot "${knot.name}" (current content: ${displayContent.slice(0, 200)}${displayContent.length > 200 ? '...' : ''})\n\nGoal: ${goal.trim()}`;

    await conversationService.startSession({
      goal: contextualGoal,
      maxIterations,
      projectPath,
      inkFilePath,
      ollamaBaseUrl: ollamaConfig!.baseUrl,
      ollamaModel: ollamaConfig!.model,
      ollamaOptions: {
        temperature: ollamaConfig!.temperature,
        maxTokens: ollamaConfig!.maxTokens,
      },
      characterConfig,
      promptLibrary,
    });
  }, [goal, maxIterations, projectPath, inkFilePath, ollamaConfig, characterConfig, promptLibrary, isOllamaConfigured, knot.name, displayContent]);

  // Handle continuing the conversation
  const handleContinue = useCallback(async () => {
    if (!conversationService.canContinue() || !isOllamaConfigured) return;

    await conversationService.continueConversation(
      ollamaConfig!.baseUrl,
      ollamaConfig!.model,
      {
        temperature: ollamaConfig!.temperature,
        maxTokens: ollamaConfig!.maxTokens,
      }
    );
  }, [ollamaConfig, isOllamaConfigured]);

  // Handle sending a user message
  const handleSendMessage = useCallback(async () => {
    if (!userMessage.trim() || !state.sessionId || !isOllamaConfigured) return;

    const message = userMessage.trim();
    setUserMessage('');

    await conversationService.sendMessage(
      message,
      ollamaConfig!.baseUrl,
      ollamaConfig!.model,
      {
        temperature: ollamaConfig!.temperature,
        maxTokens: ollamaConfig!.maxTokens,
      }
    );
  }, [userMessage, state.sessionId, ollamaConfig, isOllamaConfigured]);

  // Handle cancelling the session
  const handleCancel = useCallback(async () => {
    await conversationService.cancelSession();
  }, []);

  // Handle resetting for a new session
  const handleNewSession = useCallback(() => {
    conversationService.reset();
    setGoal('');
    setUserMessage('');
  }, []);

  // Handle key press in goal textarea
  const handleGoalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && goal.trim()) {
      e.preventDefault();
      handleStart();
    }
  };

  // Handle key press in message input
  const handleMessageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && userMessage.trim()) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isEnabled) {
    return (
      <div className="ink-ai-disabled">
        <p>AI generation is not enabled.</p>
        <p className="ink-ai-hint">Configure Ollama in Settings to use AI features.</p>
      </div>
    );
  }

  return (
    <div className="ink-ai-assistant">
      {/* Context header */}
      <div className="ink-ai-context">
        <span className="ink-ai-context-label">Continue from:</span>
        <code className="ink-ai-context-knot">{knot.name}</code>
        {characterConfig && (
          <span className="ink-ai-character-badge">
            {characterConfig.characterId}
          </span>
        )}
      </div>

      {/* Status indicator */}
      {state.status !== 'idle' && (
        <div className={`ink-ai-status ink-ai-status--${state.status}`}>
          <span className="ink-ai-status-dot" />
          <span className="ink-ai-status-text">
            {state.status === 'thinking' ? 'Thinking...' :
             state.status === 'executing_tools' ? 'Working...' :
             state.status === 'active' ? 'Active' :
             state.status === 'completed' ? 'Completed' :
             state.status === 'error' ? 'Error' :
             state.status === 'max_iterations' ? 'Max iterations' :
             state.status === 'cancelled' ? 'Cancelled' : ''}
          </span>
          {state.sessionId && (
            <span className="ink-ai-status-turn">
              {state.iterationCount}/{state.maxIterations}
            </span>
          )}
        </div>
      )}

      {/* Setup section (shown when idle) */}
      {state.status === 'idle' && (
        <div className="ink-ai-setup">
          <div className="ink-ai-field">
            <label className="ink-ai-label">What should happen next?</label>
            <textarea
              className="ink-ai-textarea"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={handleGoalKeyDown}
              placeholder="Describe what you want to create..."
              rows={3}
            />
          </div>

          <div className="ink-ai-examples">
            {knotGoalExamples.map((example, i) => (
              <button
                key={i}
                type="button"
                className="ink-ai-example"
                onClick={() => setGoal(example)}
              >
                {example.length > 60 ? example.substring(0, 60) + '...' : example}
              </button>
            ))}
          </div>

          <div className="ink-ai-field ink-ai-field--inline">
            <label className="ink-ai-label">Max turns: {maxIterations}</label>
            <input
              type="range"
              min={5}
              max={30}
              value={maxIterations}
              onChange={e => setMaxIterations(parseInt(e.target.value))}
              className="ink-ai-slider"
            />
          </div>

          <button
            type="button"
            className="ink-btn ink-btn-ai ink-btn-ai--full"
            onClick={handleStart}
            disabled={!goal.trim() || !isOllamaConfigured}
          >
            Start AI Assistant
          </button>
        </div>
      )}

      {/* Messages section (shown when session active) */}
      {state.status !== 'idle' && (
        <>
          <div className="ink-ai-messages">
            {state.messages.map(msg => (
              <div
                key={msg.id}
                className={`ink-ai-message ink-ai-message--${msg.role} ${msg.fullContent ? 'ink-ai-message--has-full' : ''}`}
                title={msg.fullContent || undefined}
              >
                <div className="ink-ai-message-header">
                  <span className="ink-ai-message-role">
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'System'}
                  </span>
                  {msg.fullContent && (
                    <span className="ink-ai-message-hint" title="Hover for full context">ℹ️</span>
                  )}
                </div>
                {msg.content && (
                  <div className="ink-ai-message-content">{msg.content}</div>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="ink-ai-tool-calls">
                    {msg.toolCalls.map((call, idx) => (
                      <div key={idx} className="ink-ai-tool-call">
                        <span className="ink-ai-tool-icon">⚙️</span>
                        <span className="ink-ai-tool-name">{call.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Typing indicator when AI is working */}
            {(state.status === 'thinking' || state.status === 'executing_tools') && (
              <div className="ink-ai-typing">
                <span className="ink-ai-typing-dot" />
                <span className="ink-ai-typing-dot" />
                <span className="ink-ai-typing-dot" />
                <span className="ink-ai-typing-text">
                  {state.status === 'thinking' ? 'AI is thinking...' : 'AI is working...'}
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Created/modified knots */}
          {(state.createdKnots.length > 0 || state.modifiedKnots.length > 0) && (
            <div className="ink-ai-stats">
              {state.createdKnots.length > 0 && (
                <span>Created: {state.createdKnots.join(', ')}</span>
              )}
              {state.modifiedKnots.length > 0 && (
                <span>Modified: {state.modifiedKnots.join(', ')}</span>
              )}
            </div>
          )}

          {/* Completion summary */}
          {state.completionSummary && (
            <div className="ink-ai-completion">
              {state.completionSummary}
            </div>
          )}

          {/* Error display */}
          {state.error && (
            <div className="ink-ai-error">{state.error}</div>
          )}

          {/* User input (shown when active) */}
          {state.status === 'active' && (
            <div className="ink-ai-input-area">
              <textarea
                className="ink-ai-textarea ink-ai-textarea--small"
                value={userMessage}
                onChange={e => setUserMessage(e.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Guide the AI or let it continue..."
                rows={2}
                disabled={state.isLoading}
              />
              <div className="ink-ai-input-actions">
                <button
                  type="button"
                  className="ink-btn ink-btn-secondary"
                  onClick={handleContinue}
                  disabled={!conversationService.canContinue()}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="ink-btn ink-btn-primary"
                  onClick={handleSendMessage}
                  disabled={!userMessage.trim() || state.isLoading}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="ink-ai-actions">
            {(state.status === 'active' || state.status === 'thinking' || state.status === 'executing_tools') && (
              <button
                type="button"
                className="ink-btn ink-btn-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}

            {conversationService.isFinished() && (
              <button
                type="button"
                className="ink-btn ink-btn-ai"
                onClick={handleNewSession}
              >
                New Session
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function InkNodeDetail({
  knot,
  onUpdate,
  onClose,
  projectPath = '',
  inkFilePath = '',
  availableKnots = [],
  availableFlags = [],
  appSettings,
  characterConfig,
  mainCharacterConfig,
  promptLibrary,
  onAIGenerate,
  onOpenAIPanel,
}: InkNodeDetailProps) {
  // Load saved mode preference
  const [mode, setMode] = useState<EditorMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    // Don't restore 'ai' mode since it now opens a separate panel
    const savedMode = saved as EditorMode;
    return (savedMode && savedMode !== 'ai') ? savedMode : 'visual';
  });

  // Save mode preference when it changes
  const handleModeChange = useCallback((newMode: EditorMode) => {
    // AI mode opens the main panel instead of staying here
    if (newMode === 'ai') {
      const displayContent = stripPositionComment(knot.bodyContent);
      onOpenAIPanel?.(knot.name, displayContent);
      return;
    }
    setMode(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
  }, [knot.name, knot.bodyContent, onOpenAIPanel]);

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
        <button
          className={`ink-detail-tab ink-detail-tab--ai ${mode === 'ai' ? 'ink-detail-tab--active' : ''}`}
          onClick={() => handleModeChange('ai')}
          title="AI Continue"
        >
          AI
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
            appSettings={appSettings}
            characterConfig={characterConfig}
            mainCharacterConfig={mainCharacterConfig}
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

        {mode === 'ai' && (
          <AIAssistantEditor
            knot={knot}
            displayContent={displayContent}
            appSettings={appSettings}
            characterConfig={characterConfig}
            projectPath={projectPath}
            inkFilePath={inkFilePath}
            promptLibrary={promptLibrary}
          />
        )}
      </div>
    </div>
  );
}

export default InkNodeDetail;
