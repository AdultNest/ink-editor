/**
 * Conversation Service
 *
 * Frontend state management for the AI conversation system.
 * Handles session lifecycle and provides reactive state updates.
 */

import type {
  ConversationSessionConfig,
  ConversationSessionState,
  ConversationTurnResult,
  OllamaMessage,
  ConversationSessionStatus,
} from '../../../preload';
import type { CharacterAIConfig } from './characterConfig';
import type { ProjectPromptLibrary } from '../../services/promptLibrary.types';

// ============================================================================
// Types
// ============================================================================

/**
 * Message for display in UI
 */
export interface ConversationDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  /** User-facing display content (cleaned up) */
  content: string;
  /** Full original content (for tooltip/debug) */
  fullContent?: string;
  /** When the message was received/created */
  timestamp: number;
  /** When the request for this message started (AI/system messages only) */
  requestStartTime?: number;
  /** When the request completed (AI/system messages only) */
  requestEndTime?: number;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
}

/**
 * Conversation state for UI
 */
export interface ConversationState {
  /** Current session ID */
  sessionId: string | null;
  /** Display messages */
  messages: ConversationDisplayMessage[];
  /** Current status */
  status: 'idle' | 'active' | 'thinking' | 'executing_tools' | 'completed' | 'error' | 'max_iterations' | 'cancelled';
  /** The goal for this session */
  goal: string;
  /** Current iteration count */
  iterationCount: number;
  /** Maximum iterations */
  maxIterations: number;
  /** Knots created during session */
  createdKnots: string[];
  /** Knots modified during session */
  modifiedKnots: string[];
  /** Error message if any */
  error: string | null;
  /** Non-fatal warning message (e.g., LLM didn't call any tools) */
  warning: string | null;
  /** Completion summary if completed */
  completionSummary: string | null;
  /** Whether we're waiting for a response */
  isLoading: boolean;
  /** Debug mode enabled */
  debugMode: boolean;
  /** Raw updates for debug display */
  rawUpdates: Array<{ timestamp: number; update: unknown }>;
  /** Current activity (e.g. tool being called) */
  currentActivity: string | null;
  /** Last history compaction info (if any) */
  lastCompaction: {
    messagesSummarized: number;
    messagesKept: number;
    timestamp: number;
  } | null;
}

/**
 * State change listener
 */
type StateListener = (state: ConversationState) => void;

/**
 * Content change listener - called when AI modifies file content
 */
type ContentChangeListener = (filePath: string, content: string) => void;

// ============================================================================
// Initial State
// ============================================================================

const initialState: ConversationState = {
  sessionId: null,
  messages: [],
  status: 'idle',
  goal: '',
  iterationCount: 0,
  maxIterations: 20,
  createdKnots: [],
  modifiedKnots: [],
  error: null,
  warning: null,
  completionSummary: null,
  isLoading: false,
  debugMode: false,
  rawUpdates: [],
  currentActivity: null,
  lastCompaction: null,
};

// ============================================================================
// Conversation Service
// ============================================================================

/**
 * Service for managing conversation state and API calls
 */
class ConversationService {
  private state: ConversationState = { ...initialState };
  private listeners: Set<StateListener> = new Set();
  private contentChangeListeners: Set<ContentChangeListener> = new Set();
  private cleanupFns: Array<() => void> = [];
  private messageIdCounter = 0;
  /** Tracks when the current pending request started (for timing display) */
  private pendingRequestStartTime: number | null = null;

  constructor() {
    // Set up IPC listeners
    this.setupListeners();
  }

  /**
   * Set up IPC event listeners
   */
  private setupListeners(): void {
    // Listen for conversation updates from backend
    const unsubUpdate = window.electronAPI.onConversationUpdate((sessionId, update) => {
      console.log('[ConversationService] Received update for session:', sessionId, 'current:', this.state.sessionId);
      console.log('[ConversationService] Update:', JSON.stringify(update, null, 2));

      if (sessionId === this.state.sessionId) {
        this.handleConversationUpdate(update);
      } else {
        console.warn('[ConversationService] Ignoring update - session ID mismatch');
      }
    });
    this.cleanupFns.push(unsubUpdate);

    // Listen for file changes (legacy - signals file changed on disk)
    const unsubFileChange = window.electronAPI.onConversationFileChange(filePath => {
      console.log('[ConversationService] File changed:', filePath);
      // File changes are handled by the existing watcher system
    });
    this.cleanupFns.push(unsubFileChange);

    // Listen for content changes (new content from AI without disk I/O)
    const unsubContentChange = window.electronAPI.onConversationContentChange((filePath, content) => {
      console.log('[ConversationService] Content changed:', filePath, 'length:', content.length);
      // Notify all content change listeners
      for (const listener of this.contentChangeListeners) {
        listener(filePath, content);
      }
    });
    this.cleanupFns.push(unsubContentChange);
  }

  /**
   * Handle conversation update from backend
   */
  private handleConversationUpdate(update: ConversationTurnResult): void {
    console.log('[ConversationService] Processing update:', {
      status: update.status,
      hasMessage: !!update.message,
      messageContent: update.message?.content?.substring(0, 100),
      toolCalls: update.toolCalls?.map(t => t.name),
      iterationCount: update.iterationCount,
    });

    // Store raw update for debug mode
    const rawUpdates = [...this.state.rawUpdates, { timestamp: Date.now(), update }];

    // Add assistant message if present
    if (update.message) {
      // Check if there are tool calls to display
      const hasToolCalls = update.toolCalls && update.toolCalls.length > 0;

      if (hasToolCalls) {
        console.log('[ConversationService] Processing tool calls:', update.toolCalls?.map(t => t.name));
        // For tool calls, create a simplified display with the formatted summary
        // but keep the tool call chips for visual indication
        // Only show text content for tools that create/modify things
        const fullContent = update.message.content || undefined;
        this.addMessage('assistant', '', update.toolCalls, fullContent);
      } else if (update.message.content) {
        // Regular message without tool calls - strip any JSON from content
        const cleanedContent = this.stripJsonFromContent(update.message.content);
        if (cleanedContent) {
          console.log('[ConversationService] Adding assistant message:', cleanedContent.substring(0, 100));
          this.addMessage('assistant', cleanedContent, undefined, update.message.content);
        } else {
          console.log('[ConversationService] Skipping message with only JSON content');
        }
      } else {
        console.log('[ConversationService] Skipping empty message');
      }
    } else {
      console.log('[ConversationService] No message in update');
    }

    // Map backend status to UI status
    // Note: When we receive an update with tool calls, the tools have ALREADY been executed.
    // The LLM will now process the results (auto-continue), so we show 'thinking' not 'executing_tools'.
    let uiStatus: ConversationState['status'] = 'active';
    if (update.status === 'completed') {
      uiStatus = 'completed';
    } else if (update.status === 'error') {
      uiStatus = 'error';
    } else if (update.status === 'max_iterations') {
      uiStatus = 'max_iterations';
    } else if (update.status === 'cancelled') {
      uiStatus = 'cancelled';
    } else if (update.awaitingUserResponse) {
      // AI is asking a question via ask_user - keep as active so user can respond
      uiStatus = 'active';
    } else if (update.toolCalls && update.toolCalls.length > 0) {
      // Tools have executed, LLM will now process results - show 'thinking'
      uiStatus = 'thinking';
    }

    // Display ask_user question as a system message
    if (update.awaitingUserResponse && update.userQuestion) {
      this.addMessage('system', `AI Question: ${update.userQuestion}`);
    }

    console.log('[ConversationService] Setting status to:', uiStatus);

    // Don't show currentActivity after tool calls - the tools are done executing
    // and the tool calls are already displayed in the message area.
    // currentActivity would be misleading since it suggests tools are still running.
    const currentActivity: string | null = null;

    // Track history compaction if it occurred
    const historyCompaction = update.historyCompaction as {
      occurred: boolean;
      messagesSummarized: number;
      messagesKept: number;
    } | undefined;

    // Show history compaction as a system message in chat
    if (historyCompaction?.occurred) {
      this.addMessage(
        'system',
        `History compacted: ${historyCompaction.messagesSummarized} older messages summarized, ${historyCompaction.messagesKept} recent messages kept.`
      );
    }

    const lastCompaction = historyCompaction?.occurred
      ? {
          messagesSummarized: historyCompaction.messagesSummarized,
          messagesKept: historyCompaction.messagesKept,
          timestamp: Date.now(),
        }
      : this.state.lastCompaction;

    this.setState({
      status: uiStatus,
      iterationCount: update.iterationCount,
      createdKnots: update.createdKnots ?? [],
      modifiedKnots: update.modifiedKnots ?? [],
      error: update.error || null,
      warning: update.warning || null,
      completionSummary: update.completionSummary || null,
      isLoading: false,
      rawUpdates,
      currentActivity,
      lastCompaction,
    });

    // If the conversation will auto-continue (status is 'thinking'), start timing for the next response
    if (uiStatus === 'thinking') {
      this.pendingRequestStartTime = Date.now();
    }
  }

  /**
   * Strip JSON tool calls from message content
   * Returns just the reasoning/commentary text
   */
  private stripJsonFromContent(content: string): string {
    // Remove JSON code blocks
    let cleaned = content.replace(/```(?:json)?\s*\n?\{[\s\S]*?\}\s*\n?```/g, '');
    // Remove standalone JSON objects that look like tool calls
    cleaned = cleaned.replace(/\{\s*"function"\s*:[\s\S]*?\n\s*\}/g, '');
    cleaned = cleaned.replace(/\{\s*"tool"\s*:[\s\S]*?\n\s*\}/g, '');
    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * Clean up user message for display (remove internal context)
   * Extracts just the user's actual goal, stripping any contextual prefixes
   */
  private cleanUserMessageForDisplay(content: string): string {
    // Pattern: "Continue from knot ... Goal: <actual goal>"
    // Use greedy match to find the LAST "Goal:" in the string
    const contextualGoalMatch = content.match(/.*Goal:\s*(.+)$/s);
    if (contextualGoalMatch) {
      return contextualGoalMatch[1].trim();
    }

    // Pattern: "My goal: <goal>\n\nPlease start..."
    const myGoalMatch = content.match(/^My goal:\s*(.+?)(?:\n\nPlease|$)/s);
    if (myGoalMatch) {
      return myGoalMatch[1].trim();
    }

    // Pattern: "Goal: <goal>" (simple format)
    const simpleGoalMatch = content.match(/^Goal:\s*(.+)$/s);
    if (simpleGoalMatch) {
      return simpleGoalMatch[1].trim();
    }

    // If content starts with "Continue from knot" but has no "Goal:" suffix
    // just show it as-is (shouldn't normally happen)
    if (content.startsWith('Continue from knot')) {
      // Try to extract any quoted content or just return a summary
      const knotNameMatch = content.match(/Continue from knot "([^"]+)"/);
      if (knotNameMatch) {
        return `Continue from: ${knotNameMatch[1]}`;
      }
    }

    // Return as-is for simple messages
    return content;
  }

  /**
   * Add a message to the conversation
   */
  private addMessage(
    role: ConversationDisplayMessage['role'],
    content: string,
    toolCalls?: ConversationDisplayMessage['toolCalls'],
    fullContent?: string
  ): void {
    // For user messages, clean up the display content
    let displayContent = content;
    let originalContent = fullContent || content;

    if (role === 'user') {
      displayContent = this.cleanUserMessageForDisplay(content);
      originalContent = content;
    }

    const now = Date.now();

    const message: ConversationDisplayMessage = {
      id: this.generateMessageId(),
      role,
      content: displayContent,
      fullContent: originalContent !== displayContent ? originalContent : undefined,
      timestamp: now,
      toolCalls,
    };

    // For AI and system messages, add timing info
    if (role !== 'user' && this.pendingRequestStartTime) {
      message.requestStartTime = this.pendingRequestStartTime;
      message.requestEndTime = now;
      // Clear the pending start time after using it
      this.pendingRequestStartTime = null;
    }

    // Use functional update to ensure we don't lose messages during rapid updates
    const currentMessages = this.state.messages;
    this.setState({
      messages: [...currentMessages, message],
    });
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<ConversationState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribe to content changes from AI.
   * Called when AI modifies file content without writing to disk.
   * The editor should use this to update its content state.
   */
  subscribeToContentChanges(listener: ContentChangeListener): () => void {
    this.contentChangeListeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.contentChangeListeners.delete(listener);
    };
  }

  /**
   * Get current state
   */
  getState(): ConversationState {
    return this.state;
  }

  /**
   * Start a new conversation session
   */
  async startSession(config: {
    goal: string;
    maxIterations: number;
    projectPath: string;
    inkFilePath: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    ollamaOptions?: { temperature?: number; maxTokens?: number };
    characterConfig?: CharacterAIConfig | null;
    playerCharacterConfig?: CharacterAIConfig | null;
    promptLibrary?: ProjectPromptLibrary | null;
  }): Promise<boolean> {
    console.log('[ConversationService] Starting session with goal:', config.goal.substring(0, 50));

    // Track when the request starts for timing display
    this.pendingRequestStartTime = Date.now();

    // Reset state
    this.setState({
      ...initialState,
      status: 'thinking',
      goal: config.goal,
      maxIterations: config.maxIterations,
      isLoading: true,
      debugMode: this.state.debugMode, // Preserve debug mode
    });

    // Add user goal message (the goal may already contain context like "Continue from knot...")
    // The message will be cleaned for display but full content shown on hover
    this.addMessage('user', config.goal);

    try {
      console.log('[ConversationService] Calling startConversationSession API...');
      const result = await window.electronAPI.startConversationSession({
        goal: config.goal,
        maxIterations: config.maxIterations,
        projectPath: config.projectPath,
        inkFilePath: config.inkFilePath,
        ollamaBaseUrl: config.ollamaBaseUrl,
        ollamaModel: config.ollamaModel,
        ollamaOptions: config.ollamaOptions,
        characterConfig: config.characterConfig,
        playerCharacterConfig: config.playerCharacterConfig,
        promptLibrary: config.promptLibrary,
      });

      console.log('[ConversationService] startConversationSession result:', result);

      if (result.success && result.sessionId) {
        console.log('[ConversationService] Session started successfully:', result.sessionId);
        // Keep status as 'thinking' - the first update from backend will set the real status
        // This ensures the input is hidden while waiting for the initial LLM response
        this.setState({
          sessionId: result.sessionId,
          // status remains 'thinking' until first update arrives
          // isLoading remains true until first update arrives
        });
        return true;
      } else {
        console.error('[ConversationService] Failed to start session:', result.error);
        this.setState({
          status: 'error',
          error: result.error || 'Failed to start session',
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start session',
        isLoading: false,
      });
      return false;
    }
  }

  /**
   * Continue the conversation (run next turn)
   */
  async continueConversation(
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ): Promise<boolean> {
    if (!this.state.sessionId) {
      return false;
    }

    // Track when the request starts for timing display
    this.pendingRequestStartTime = Date.now();

    this.setState({
      status: 'thinking',
      isLoading: true,
    });

    try {
      const result = await window.electronAPI.continueConversation(
        this.state.sessionId,
        ollamaBaseUrl,
        ollamaModel,
        ollamaOptions
      );

      // Update is handled by the IPC listener
      return result.status === 'active';
    } catch (error) {
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to continue conversation',
        isLoading: false,
      });
      return false;
    }
  }

  /**
   * Send a user message to the conversation
   */
  async sendMessage(
    content: string,
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ): Promise<boolean> {
    if (!this.state.sessionId) {
      return false;
    }

    // Add user message immediately
    this.addMessage('user', content);

    // Track when the request starts for timing display
    this.pendingRequestStartTime = Date.now();

    this.setState({
      status: 'thinking',
      isLoading: true,
    });

    try {
      const result = await window.electronAPI.sendConversationMessage(
        this.state.sessionId,
        content,
        ollamaBaseUrl,
        ollamaModel,
        ollamaOptions
      );

      // Update is handled by the IPC listener
      return result.status === 'active';
    } catch (error) {
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to send message',
        isLoading: false,
      });
      return false;
    }
  }

  /**
   * Cancel the current session
   */
  async cancelSession(): Promise<boolean> {
    if (!this.state.sessionId) {
      return false;
    }

    try {
      const result = await window.electronAPI.cancelConversationSession(this.state.sessionId);
      if (result) {
        this.setState({
          status: 'cancelled',
          isLoading: false,
        });
      }
      return result;
    } catch (error) {
      console.error('[ConversationService] Failed to cancel session:', error);
      return false;
    }
  }

  /**
   * End and clean up the session
   */
  async endSession(): Promise<void> {
    if (this.state.sessionId) {
      try {
        await window.electronAPI.endConversationSession(this.state.sessionId);
      } catch (error) {
        console.error('[ConversationService] Failed to end session:', error);
      }
    }

    // Reset to initial state
    this.setState({ ...initialState });
  }

  /**
   * Reset to idle state (for UI reset without ending backend session)
   */
  reset(): void {
    this.setState({ ...initialState });
  }

  /**
   * Load an existing session from backend
   */
  async loadSession(sessionId: string): Promise<boolean> {
    try {
      const sessionState = await window.electronAPI.getConversationState(sessionId);
      if (!sessionState) {
        console.error('[ConversationService] Session not found:', sessionId);
        return false;
      }

      // Convert backend messages to display messages
      const displayMessages: ConversationDisplayMessage[] = [];
      for (const msg of sessionState.messages) {
        if (msg.role === 'system') continue; // Skip system messages

        let content = msg.content;
        let fullContent: string | undefined;

        // Clean up user messages
        if (msg.role === 'user') {
          fullContent = content;
          content = this.cleanUserMessageForDisplay(content);
        }

        // Extract tool calls from assistant messages
        let toolCalls: ConversationDisplayMessage['toolCalls'];
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          toolCalls = msg.tool_calls.map(tc => ({
            name: tc.function.name,
            arguments: tc.function.arguments,
            result: '', // Results are in separate tool messages
          }));
        }

        displayMessages.push({
          id: this.generateMessageId(),
          role: msg.role as 'user' | 'assistant' | 'tool',
          content: content || '',
          fullContent,
          timestamp: Date.now(),
          toolCalls,
        });
      }

      // Map backend status to UI status
      let uiStatus: ConversationState['status'] = 'active';
      if (sessionState.status === 'completed') uiStatus = 'completed';
      else if (sessionState.status === 'error') uiStatus = 'error';
      else if (sessionState.status === 'max_iterations') uiStatus = 'max_iterations';
      else if (sessionState.status === 'cancelled') uiStatus = 'cancelled';

      this.setState({
        sessionId: sessionState.sessionId,
        messages: displayMessages,
        status: uiStatus,
        goal: sessionState.goal,
        iterationCount: sessionState.iterationCount,
        maxIterations: sessionState.maxIterations,
        createdKnots: sessionState.createdKnots,
        modifiedKnots: sessionState.modifiedKnots,
        error: sessionState.error || null,
        warning: null, // Clear warning when loading session
        isLoading: false,
        debugMode: this.state.debugMode,
        rawUpdates: [],
        currentActivity: null,
        completionSummary: null,
        lastCompaction: null, // Reset compaction info when loading session
      });

      console.log('[ConversationService] Loaded session:', sessionId);
      return true;
    } catch (error) {
      console.error('[ConversationService] Failed to load session:', error);
      return false;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.state.sessionId;
  }

  /**
   * Check if session is active and can continue
   */
  canContinue(): boolean {
    return (
      this.state.sessionId !== null &&
      this.state.status === 'active' &&
      !this.state.isLoading &&
      this.state.iterationCount < this.state.maxIterations
    );
  }

  /**
   * Check if session is finished (completed, error, or max iterations)
   */
  isFinished(): boolean {
    return ['completed', 'error', 'max_iterations', 'cancelled'].includes(this.state.status);
  }

  /**
   * Toggle debug mode
   */
  toggleDebugMode(): void {
    this.setState({ debugMode: !this.state.debugMode });
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.setState({ debugMode: enabled });
  }

  /**
   * Cleanup on unmount
   */
  cleanup(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];
    this.listeners.clear();
    this.contentChangeListeners.clear();
  }
}

// Export singleton instance
export const conversationService = new ConversationService();

// Export class for testing
export { ConversationService };
