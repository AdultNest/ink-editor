/**
 * ConversationPanel Component
 *
 * Slide-in panel for AI-assisted story generation.
 * Provides goal input, iteration control, and message display.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  conversationService,
  type ConversationState,
  type ConversationDisplayMessage,
} from '../ai/conversationService';
import { GOAL_EXAMPLES } from '../ai/conversationPrompts';
import type { AppSettings } from '../../../preload';
import type { CharacterAIConfig } from '../ai/characterConfig';
import type { ProjectPromptLibrary } from '../../services/promptLibrary.types';

import './ConversationPanel.css';

export interface ConversationPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Application settings (for Ollama config) */
  appSettings: AppSettings;
  /** Project root path */
  projectPath: string;
  /** Path to the current ink file */
  inkFilePath: string;
  /** Character AI configuration */
  characterConfig?: CharacterAIConfig | null;
  /** Project prompt library */
  promptLibrary?: ProjectPromptLibrary | null;
}

/**
 * Format a tool call for display
 */
function formatToolCall(call: { name: string; arguments: Record<string, unknown>; result: string }): string {
  const argsStr = Object.entries(call.arguments)
    .map(([key, value]) => {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      const truncated = strValue.length > 50 ? strValue.substring(0, 50) + '...' : strValue;
      return `${key}: ${truncated}`;
    })
    .join(', ');

  return `${call.name}(${argsStr})`;
}

/**
 * Truncate long result strings
 */
function truncateResult(result: string, maxLength: number = 200): string {
  if (result.length <= maxLength) return result;
  return result.substring(0, maxLength) + '...';
}

/**
 * Message component for the conversation
 */
function Message({ message }: { message: ConversationDisplayMessage }) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const toggleTool = (index: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div
      className={`conversation-message conversation-message-${message.role}${message.fullContent ? ' conversation-message--has-full' : ''}`}
      title={message.fullContent || undefined}
    >
      <div className="conversation-message-header">
        <span className="conversation-message-role">
          {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'System'}
        </span>
        {message.fullContent && (
          <span className="conversation-message-hint" title="Hover for full context">ℹ️</span>
        )}
        <span className="conversation-message-time">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {message.content && (
        <div className="conversation-message-content">
          {message.content}
        </div>
      )}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="conversation-tool-calls">
          {message.toolCalls.map((call, index) => (
            <div key={index} className="conversation-tool-call">
              <div
                className="conversation-tool-call-header"
                onClick={() => toggleTool(index)}
              >
                <span className="conversation-tool-icon">⚙️</span>
                <span className="conversation-tool-name">{formatToolCall(call)}</span>
                <span className="conversation-tool-toggle">
                  {expandedTools.has(index) ? '▼' : '▶'}
                </span>
              </div>
              {expandedTools.has(index) && (
                <div className="conversation-tool-call-result">
                  <pre>{call.result}</pre>
                </div>
              )}
              {!expandedTools.has(index) && call.result && (
                <div className="conversation-tool-call-preview">
                  {truncateResult(call.result, 100)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Status indicator component
 */
function StatusIndicator({ state }: { state: ConversationState }) {
  let statusText = '';
  let statusClass = '';

  switch (state.status) {
    case 'idle':
      statusText = 'Ready';
      statusClass = 'idle';
      break;
    case 'thinking':
      statusText = 'Thinking...';
      statusClass = 'thinking';
      break;
    case 'active':
      statusText = 'Active';
      statusClass = 'active';
      break;
    case 'executing_tools':
      statusText = 'Executing tools...';
      statusClass = 'executing';
      break;
    case 'completed':
      statusText = 'Completed';
      statusClass = 'completed';
      break;
    case 'error':
      statusText = 'Error';
      statusClass = 'error';
      break;
    case 'max_iterations':
      statusText = 'Max iterations reached';
      statusClass = 'warning';
      break;
    case 'cancelled':
      statusText = 'Cancelled';
      statusClass = 'cancelled';
      break;
  }

  return (
    <div className={`conversation-status conversation-status-${statusClass}`}>
      <span className="conversation-status-dot" />
      <span className="conversation-status-text">{statusText}</span>
      {state.sessionId && (
        <span className="conversation-status-iteration">
          Turn {state.iterationCount}/{state.maxIterations}
        </span>
      )}
    </div>
  );
}

/**
 * Main ConversationPanel component
 */
export function ConversationPanel({
  isOpen,
  onClose,
  appSettings,
  projectPath,
  inkFilePath,
  characterConfig,
  promptLibrary,
}: ConversationPanelProps) {
  const [state, setState] = useState<ConversationState>(conversationService.getState());
  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(20);
  const [userMessage, setUserMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = conversationService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && state.status === 'idle') {
      inputRef.current?.focus();
    }
  }, [isOpen, state.status]);

  // Get Ollama config
  const ollamaConfig = appSettings?.ollama;
  const isOllamaConfigured = ollamaConfig?.enabled && ollamaConfig?.baseUrl && ollamaConfig?.model;

  // Handle starting a session
  const handleStart = useCallback(async () => {
    if (!goal.trim() || !isOllamaConfigured) return;

    await conversationService.startSession({
      goal: goal.trim(),
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
  }, [goal, maxIterations, projectPath, inkFilePath, ollamaConfig, characterConfig, promptLibrary, isOllamaConfigured]);

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

  // Handle closing the panel
  const handleClose = useCallback(async () => {
    await conversationService.endSession();
    setGoal('');
    setUserMessage('');
    onClose();
  }, [onClose]);

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

  if (!isOpen) return null;

  return (
    <div className="conversation-panel-overlay" onClick={handleClose}>
      <div className="conversation-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="conversation-panel-header">
          <h2>AI Story Assistant</h2>
          <button className="conversation-close-btn" onClick={handleClose} title="Close">
            ×
          </button>
        </div>

        {/* Status bar */}
        <StatusIndicator state={state} />

        {/* Main content */}
        <div className="conversation-panel-content">
          {/* Setup section (shown when idle) */}
          {state.status === 'idle' && (
            <div className="conversation-setup">
              <div className="conversation-field">
                <label htmlFor="goal-input">What would you like to create?</label>
                <textarea
                  id="goal-input"
                  ref={inputRef}
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  onKeyDown={handleGoalKeyDown}
                  placeholder="Describe your goal..."
                  rows={3}
                />
                <div className="conversation-examples">
                  <span>Examples:</span>
                  {GOAL_EXAMPLES.slice(0, 3).map((example, i) => (
                    <button
                      key={i}
                      className="conversation-example-btn"
                      onClick={() => setGoal(example)}
                    >
                      {example.length > 50 ? example.substring(0, 50) + '...' : example}
                    </button>
                  ))}
                </div>
              </div>

              <div className="conversation-field">
                <label htmlFor="iterations-slider">
                  Max iterations: {maxIterations}
                </label>
                <input
                  id="iterations-slider"
                  type="range"
                  min={5}
                  max={50}
                  value={maxIterations}
                  onChange={e => setMaxIterations(parseInt(e.target.value))}
                />
                <div className="conversation-field-hint">
                  Higher values allow more complex tasks but take longer
                </div>
              </div>

              <button
                className="conversation-start-btn"
                onClick={handleStart}
                disabled={!goal.trim() || !isOllamaConfigured}
              >
                Start Generation
              </button>

              {!isOllamaConfigured && (
                <div className="conversation-warning">
                  Ollama is not configured. Please configure it in Settings.
                </div>
              )}
            </div>
          )}

          {/* Messages section (shown when session active) */}
          {state.status !== 'idle' && (
            <>
              <div className="conversation-messages">
                {state.messages.map(msg => (
                  <Message key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Stats bar */}
              <div className="conversation-stats">
                {state.createdKnots.length > 0 && (
                  <span className="conversation-stat">
                    Created: {state.createdKnots.join(', ')}
                  </span>
                )}
                {state.modifiedKnots.length > 0 && (
                  <span className="conversation-stat">
                    Modified: {state.modifiedKnots.join(', ')}
                  </span>
                )}
              </div>

              {/* Completion summary */}
              {state.completionSummary && (
                <div className="conversation-completion">
                  <strong>Completed:</strong> {state.completionSummary}
                </div>
              )}

              {/* Error display */}
              {state.error && (
                <div className="conversation-error">
                  <strong>Error:</strong> {state.error}
                </div>
              )}

              {/* User input (shown when active) */}
              {state.status === 'active' && (
                <div className="conversation-input-area">
                  <textarea
                    value={userMessage}
                    onChange={e => setUserMessage(e.target.value)}
                    onKeyDown={handleMessageKeyDown}
                    placeholder="Send a message or let AI continue..."
                    rows={2}
                    disabled={state.isLoading}
                  />
                  <div className="conversation-input-actions">
                    <button
                      onClick={handleContinue}
                      disabled={!conversationService.canContinue()}
                      title="Let AI take the next turn"
                    >
                      Continue
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={!userMessage.trim() || state.isLoading}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="conversation-actions">
                {(state.status === 'active' || state.status === 'thinking' || state.status === 'executing_tools') && (
                  <button
                    className="conversation-cancel-btn"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                )}

                {conversationService.isFinished() && (
                  <button
                    className="conversation-new-btn"
                    onClick={handleNewSession}
                  >
                    New Session
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConversationPanel;
