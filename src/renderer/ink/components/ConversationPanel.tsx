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
import { findMainCharacter, type CharacterAIConfig } from '../ai/characterConfig';
import SessionsPanel from './SessionsPanel';
import type { AppSettings } from '../../../preload';
import type { ProjectPromptLibrary } from '../../services/promptLibrary.types';
import { parseKnotContent } from '../parser/knotContentParser';
import type { KnotContentItem } from '../parser/inkTypes';

import './ConversationPanel.css';

/**
 * Serialize KnotContentItem[] to a JSON format suitable for LLM context.
 * Uses the same format as the AI tool system for consistency.
 */
function serializeKnotContentForLLM(items: KnotContentItem[]): string {
  const elements: Array<Record<string, unknown>> = [];

  for (const item of items) {
    switch (item.type) {
      case 'text':
        elements.push({ receive_message: { text: item.content } });
        break;
      case 'image':
        elements.push({ receive_image: { reference: item.filename } });
        break;
      case 'player-image':
        elements.push({ send_image: { reference: item.filename } });
        break;
      case 'choice':
        // Check if this is a real branching choice or a player message
        // A choice with no divert, or diverting to a stitch (contains '.'), is a player message
        const isStitchDivert = item.divert && item.divert.includes('.');
        if (item.divert && !isStitchDivert) {
          // Real branching choice to another knot
          elements.push({ choice: { text: item.label || item.text, targetKnot: item.divert } });
        } else {
          // Player message: no divert, or divert to internal stitch
          elements.push({ send_message: { text: item.label || item.text } });
        }
        break;
      case 'divert':
        // Skip stitch diverts (internal navigation) - their content is serialized inline
        if (!item.target.includes('.')) {
          elements.push({ divert: { targetKnot: item.target } });
        }
        break;
      case 'flag-operation':
        elements.push({ flag: { operation: item.operation, name: item.flagName } });
        break;
      case 'fake-type':
        elements.push({ typing_indicator: { duration: item.durationSeconds } });
        break;
      case 'wait':
        elements.push({ wait: { duration: item.durationSeconds } });
        break;
      case 'stitch':
        // Recursively serialize stitch content
        if (item.content && item.content.length > 0) {
          const stitchElements = JSON.parse(serializeKnotContentForLLM(item.content));
          elements.push(...stitchElements);
        }
        break;
      // Skip other types that aren't relevant for LLM context
    }
  }

  return JSON.stringify(elements, null, 2);
}

/** Context for "continue from" knot feature */
export interface ContinueFromKnot {
  /** Name of the knot to continue from */
  name: string;
  /** Content of the knot (for context) */
  content: string;
}

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
  /** Optional knot context for "continue from" feature */
  continueFromKnot?: ContinueFromKnot | null;
  /** Callback when continueFromKnot is consumed (to clear it) */
  onContinueFromConsumed?: () => void;
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
 * Format duration in a human-readable way
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
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

  // Calculate duration for AI/system messages
  const hasTiming = message.requestStartTime && message.requestEndTime;
  const duration = hasTiming ? message.requestEndTime! - message.requestStartTime! : null;

  return (
    <div
      className={`conversation-message conversation-message-${message.role}${message.fullContent ? ' conversation-message--has-full' : ''}`}
      title={message.fullContent || undefined}
    >
      <div className="conversation-message-header">
        <span className="conversation-message-role">
          {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'System'}
        </span>
        <span className="conversation-message-time">
          {message.role === 'user' ? (
            // User messages: just show the timestamp
            new Date(message.timestamp).toLocaleTimeString()
          ) : hasTiming ? (
            // AI/System messages with timing: show start → end (duration)
            <>
              <span className="conversation-message-time-range">
                {new Date(message.requestStartTime!).toLocaleTimeString()}
                {' → '}
                {new Date(message.requestEndTime!).toLocaleTimeString()}
              </span>
              <span className="conversation-message-duration">
                ({formatDuration(duration!)})
              </span>
            </>
          ) : (
            // Fallback: just show timestamp
            new Date(message.timestamp).toLocaleTimeString()
          )}
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
              {expandedTools.has(index) && call.result && (
                <div className="conversation-tool-call-result">
                  <pre>{call.result}</pre>
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
      {state.currentActivity && (
        <span className="conversation-status-tool">
          {state.currentActivity}
        </span>
      )}
      {state.sessionId && (
        <span className="conversation-status-iteration">
          Turn {state.iterationCount}/{state.maxIterations}
        </span>
      )}
    </div>
  );
}

/**
 * Parsed debug update with separate LLM and tool parts
 */
interface ParsedDebugUpdate {
  llmContent: string | null;
  toolCalls: Array<{
    name: string;
    args: string;
    result: string;
  }>;
  historyCompaction?: {
    occurred: boolean;
    messagesSummarized: number;
    messagesKept: number;
    summary: string;
  };
}

/**
 * Parse debug update into structured parts
 */
function parseDebugUpdate(update: unknown): ParsedDebugUpdate {
  const u = update as {
    message?: { role?: string; content?: string };
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result: string }>;
    historyCompaction?: {
      occurred: boolean;
      messagesSummarized: number;
      messagesKept: number;
      summary: string;
    };
  };

  const llmContent = u.message?.content || null;

  const toolCalls: ParsedDebugUpdate['toolCalls'] = [];
  if (u.toolCalls && u.toolCalls.length > 0) {
    for (const tool of u.toolCalls) {
      toolCalls.push({
        name: tool.name,
        args: JSON.stringify(tool.arguments, null, 2),
        result: tool.result,
      });
    }
  }

  // Extract history compaction info if present
  const historyCompaction = u.historyCompaction?.occurred ? u.historyCompaction : undefined;

  return { llmContent, toolCalls, historyCompaction };
}

/**
 * Format debug update as plain text for copy
 */
function formatDebugUpdateText(update: unknown): string {
  const parsed = parseDebugUpdate(update);
  const parts: string[] = [];

  if (parsed.llmContent) {
    parts.push(`[LLM] ${parsed.llmContent}`);
  }

  for (const tool of parsed.toolCalls) {
    parts.push(`[TOOL] ${tool.name}(${tool.args})\n[RESULT] ${tool.result}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : JSON.stringify(update, null, 2);
}

/**
 * Extract raw thinking content from update (full LLM response before parsing)
 */
function getRawThinking(update: unknown): string | null {
  const u = update as { message?: { thinking?: string } };
  return u.message?.thinking || null;
}

/**
 * Copy button for individual debug sections
 */
function DebugCopyButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      className="conversation-debug-copy-icon"
      onClick={handleCopy}
      title={title || 'Copy to clipboard'}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}

/**
 * Debug panel component with copy functionality
 */
function DebugPanel({
  rawUpdates,
  messages,
}: {
  rawUpdates: Array<{ timestamp: number; update: unknown }>;
  messages: ConversationDisplayMessage[];
}) {
  const debugContentRef = useRef<HTMLDivElement>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [showCompaction, setShowCompaction] = useState(true); // Show by default as it's important

  // Check if any update has compaction info
  const hasCompaction = rawUpdates.some(item => {
    const parsed = parseDebugUpdate(item.update);
    return parsed.historyCompaction?.occurred;
  });

  return (
    <div className="conversation-debug">
      <div className="conversation-debug-header">
        <strong>Debug ({rawUpdates.length} updates)</strong>
        <div className="conversation-debug-toggles">
          <label className="conversation-debug-toggle">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={e => setShowThinking(e.target.checked)}
            />
            Thinking
          </label>
          <label className="conversation-debug-toggle">
            <input
              type="checkbox"
              checked={showRawResponse}
              onChange={e => setShowRawResponse(e.target.checked)}
            />
            Raw Response
          </label>
          {hasCompaction && (
            <label className="conversation-debug-toggle">
              <input
                type="checkbox"
                checked={showCompaction}
                onChange={e => setShowCompaction(e.target.checked)}
              />
              Compaction
            </label>
          )}
        </div>
      </div>
      <div className="conversation-debug-content" ref={debugContentRef}>
        {/* Sent messages section */}
        <div className="conversation-debug-section">
          <div className="conversation-debug-section-header">
            <span className="conversation-debug-section-title">Sent Messages</span>
            <DebugCopyButton
              text={messages
                .filter(m => m.role === 'user')
                .map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.fullContent || m.content}`)
                .join('\n\n')}
              title="Copy all sent messages"
            />
          </div>
          {messages.filter(m => m.role === 'user').map((msg, idx) => (
            <div key={`sent-${idx}`} className="conversation-debug-item conversation-debug-item-sent">
              <div className="conversation-debug-item-header">
                <span className="conversation-debug-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <DebugCopyButton text={msg.fullContent || msg.content} title="Copy message" />
              </div>
              <pre>{msg.fullContent || msg.content}</pre>
            </div>
          ))}
        </div>

        {/* Raw updates section */}
        <div className="conversation-debug-section">
          <div className="conversation-debug-section-header">
            <span className="conversation-debug-section-title">Received Updates</span>
          </div>
          {rawUpdates.map((item, idx) => {
            const parsed = parseDebugUpdate(item.update);
            const rawThinking = getRawThinking(item.update);
            return (
              <div key={`update-${idx}`} className="conversation-debug-item">
                <div className="conversation-debug-time">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>

                {/* History Compaction - when conversation was auto-compacted */}
                {showCompaction && parsed.historyCompaction?.occurred && (
                  <div className="conversation-debug-block conversation-debug-compaction">
                    <div className="conversation-debug-block-header">
                      <span className="conversation-debug-label">
                        📦 History Compacted ({parsed.historyCompaction.messagesSummarized} → 1 summary + {parsed.historyCompaction.messagesKept} recent)
                      </span>
                      <DebugCopyButton text={parsed.historyCompaction.summary} title="Copy summary" />
                    </div>
                    <pre>{parsed.historyCompaction.summary}</pre>
                  </div>
                )}

                {/* Raw Thinking - internal model reasoning (only when toggle is ON) */}
                {showThinking && rawThinking && (
                  <div className="conversation-debug-block conversation-debug-thinking">
                    <div className="conversation-debug-block-header">
                      <span className="conversation-debug-label">Thinking</span>
                      <DebugCopyButton text={rawThinking} title="Copy thinking" />
                    </div>
                    <pre>{rawThinking}</pre>
                  </div>
                )}

                {/* Raw LLM Response content (only when toggle is ON) */}
                {showRawResponse && parsed.llmContent && (
                  <div className="conversation-debug-block conversation-debug-raw-response">
                    <div className="conversation-debug-block-header">
                      <span className="conversation-debug-label">Raw LLM Response</span>
                      <DebugCopyButton text={parsed.llmContent} title="Copy raw response" />
                    </div>
                    <pre>{parsed.llmContent}</pre>
                  </div>
                )}

                {/* Tool calls and results (always shown) */}
                {parsed.toolCalls.length > 0 ? (
                  parsed.toolCalls.map((tool, toolIdx) => (
                    <div key={toolIdx} className="conversation-debug-tool">
                      <div className="conversation-debug-block conversation-debug-tool-call">
                        <div className="conversation-debug-block-header">
                          <span className="conversation-debug-label">Tool Call</span>
                          <DebugCopyButton text={`${tool.name}(${tool.args})`} title="Copy tool call" />
                        </div>
                        <pre>⚙️ {tool.name}({tool.args})</pre>
                      </div>
                      <div className="conversation-debug-block conversation-debug-tool-result">
                        <div className="conversation-debug-block-header">
                          <span className="conversation-debug-label">Result</span>
                          <DebugCopyButton text={tool.result} title="Copy result" />
                        </div>
                        <pre>{tool.result}</pre>
                      </div>
                    </div>
                  ))
                ) : (
                  /* No tool calls - show indicator when both toggles are off */
                  !showThinking && !showRawResponse && (rawThinking || parsed.llmContent) && (
                    <div className="conversation-debug-block conversation-debug-no-tools">
                      <div className="conversation-debug-block-header">
                        <span className="conversation-debug-label">No Tool Call</span>
                        {parsed.llmContent && (
                          <DebugCopyButton text={parsed.llmContent} title="Copy response" />
                        )}
                      </div>
                      <pre>LLM responded without calling a tool. Enable toggles above to see details.</pre>
                      {parsed.llmContent && <pre className="conversation-debug-preview">{parsed.llmContent.substring(0, 200)}{parsed.llmContent.length > 200 ? '...' : ''}</pre>}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
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
  continueFromKnot,
  onContinueFromConsumed,
}: ConversationPanelProps) {
  const [state, setState] = useState<ConversationState>(conversationService.getState());
  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(20);
  const [userMessage, setUserMessage] = useState('');
  const [showSessionsPanel, setShowSessionsPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track the last consumed continueFromKnot to avoid re-applying
  const lastConsumedKnotRef = useRef<string | null>(null);

  // Store the active continue-from context (passed to LLM but not shown in goal input)
  const [activeContinueFrom, setActiveContinueFrom] = useState<{
    knotName: string;
    serializedContent: string;
  } | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = conversationService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Handle "continue from" knot context when panel opens
  useEffect(() => {
    if (isOpen && continueFromKnot && state.status === 'idle') {
      // Only apply if this is a different knot than last time (or first time)
      if (lastConsumedKnotRef.current !== continueFromKnot.name) {
        lastConsumedKnotRef.current = continueFromKnot.name;

        // Parse and serialize the knot content to LLM-friendly JSON format
        const parsedContent = parseKnotContent(continueFromKnot.content, continueFromKnot.name);
        const serializedContent = serializeKnotContentForLLM(parsedContent);

        // Store the context separately (not in the goal input)
        setActiveContinueFrom({
          knotName: continueFromKnot.name,
          serializedContent,
        });

        // Notify parent that we consumed the context
        onContinueFromConsumed?.();

        // Focus the input
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [isOpen, continueFromKnot, state.status, onContinueFromConsumed]);

  // Clear continue-from context when a session starts or panel closes
  useEffect(() => {
    if (!isOpen || state.status !== 'idle') {
      // Don't clear immediately when session starts - we need it for handleStart
      // Only clear when panel closes
      if (!isOpen) {
        setActiveContinueFrom(null);
        lastConsumedKnotRef.current = null;
      }
    }
  }, [isOpen, state.status]);

  // Focus input when panel opens (without continueFromKnot)
  useEffect(() => {
    if (isOpen && state.status === 'idle' && !continueFromKnot) {
      inputRef.current?.focus();
    }
  }, [isOpen, state.status, continueFromKnot]);

  // Get Ollama config
  const ollamaConfig = appSettings?.ollama;
  const isOllamaConfigured = ollamaConfig?.enabled && ollamaConfig?.baseUrl && ollamaConfig?.model;

  // Handle starting a session
  const handleStart = useCallback(async () => {
    if (!goal.trim() || !isOllamaConfigured) return;

    // Load player character config (main character marked isMainCharacter: true)
    const playerCharConfig = await findMainCharacter(projectPath);

    // Build the full goal, including continue-from context if present
    let fullGoal = goal.trim();
    if (activeContinueFrom) {
      fullGoal = `Continue from knot "${activeContinueFrom.knotName}"

Current knot content (JSON format):
${activeContinueFrom.serializedContent}

User's goal: ${fullGoal}`;
    }

    // Clear the continue-from context after starting
    setActiveContinueFrom(null);

    await conversationService.startSession({
      goal: fullGoal,
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
      playerCharacterConfig: playerCharConfig,
      promptLibrary,
    });
  }, [goal, maxIterations, projectPath, inkFilePath, ollamaConfig, characterConfig, promptLibrary, isOllamaConfigured, activeContinueFrom]);

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

  // Handle closing the panel (just hide, don't end session)
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle ending the session completely
  const handleEndSession = useCallback(async () => {
    await conversationService.endSession();
    setGoal('');
    setUserMessage('');
  }, []);

  // Handle resetting for a new session (ends current session first)
  const handleNewSession = useCallback(async () => {
    await conversationService.endSession();
    setGoal('');
    setUserMessage('');
  }, []);

  // Toggle debug mode
  const handleToggleDebug = useCallback(() => {
    conversationService.toggleDebugMode();
  }, []);

  // Handle session selection from SessionsPanel
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    await conversationService.loadSession(sessionId);
    setShowSessionsPanel(false);
  }, []);

  // Handle session deletion
  const handleSessionDelete = useCallback((sessionId: string) => {
    // If the deleted session is the current one, reset
    if (sessionId === state.sessionId) {
      conversationService.reset();
      setGoal('');
      setUserMessage('');
    }
  }, [state.sessionId]);

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
          <sub className="conversation-panel-token-hint">May require high token count</sub>
          <button
            className="conversation-sessions-btn"
            onClick={() => setShowSessionsPanel(true)}
            title="View all sessions"
          >
            Sessions
          </button>
          <button
            className={`conversation-debug-btn ${state.debugMode ? 'active' : ''}`}
            onClick={handleToggleDebug}
            title="Toggle debug mode"
          >
            🐛
          </button>
          <button className="conversation-close-btn" onClick={handleClose} title="Hide panel (session continues in background)">
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
              {/* Continue-from indicator */}
              {activeContinueFrom && (
                <div className="conversation-continue-from">
                  <div className="conversation-continue-from-header">
                    <span className="conversation-continue-from-icon">↪</span>
                    <span>Continuing from knot:</span>
                    <code className="conversation-continue-from-knot">{activeContinueFrom.knotName}</code>
                    <button
                      className="conversation-continue-from-clear"
                      onClick={() => setActiveContinueFrom(null)}
                      title="Clear continue-from context"
                    >
                      ×
                    </button>
                  </div>
                  <div className="conversation-continue-from-hint">
                    The knot content will be automatically included in your request
                  </div>
                </div>
              )}

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

              {/* Warning display */}
              {state.warning && !state.error && (
                <div className="conversation-warning conversation-warning-box">
                  <strong>Notice:</strong> {state.warning}
                </div>
              )}

              {/* Debug panel */}
              {state.debugMode && (
                <DebugPanel rawUpdates={state.rawUpdates} messages={state.messages} />
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
                    Stop
                  </button>
                )}

                {state.sessionId && (
                  <button
                    className="conversation-end-btn"
                    onClick={handleEndSession}
                    title="End session and delete from history"
                  >
                    End Session
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

      {/* Sessions Panel */}
      <SessionsPanel
        isOpen={showSessionsPanel}
        onClose={() => setShowSessionsPanel(false)}
        currentSessionId={state.sessionId}
        onSessionSelect={handleSessionSelect}
        onSessionDelete={handleSessionDelete}
        inkFilePath={inkFilePath}
      />
    </div>
  );
}

export default ConversationPanel;
