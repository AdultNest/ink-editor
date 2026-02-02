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
  timestamp: number;
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
  /** Completion summary if completed */
  completionSummary: string | null;
  /** Whether we're waiting for a response */
  isLoading: boolean;
}

/**
 * State change listener
 */
type StateListener = (state: ConversationState) => void;

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
  completionSummary: null,
  isLoading: false,
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
  private cleanupFns: Array<() => void> = [];
  private messageIdCounter = 0;

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
      if (sessionId === this.state.sessionId) {
        this.handleConversationUpdate(update);
      }
    });
    this.cleanupFns.push(unsubUpdate);

    // Listen for file changes
    const unsubFileChange = window.electronAPI.onConversationFileChange(filePath => {
      console.log('[ConversationService] File changed:', filePath);
      // File changes are handled by the existing watcher system
    });
    this.cleanupFns.push(unsubFileChange);
  }

  /**
   * Handle conversation update from backend
   */
  private handleConversationUpdate(update: ConversationTurnResult): void {
    // Add assistant message if present
    if (update.message) {
      // Check if there are tool calls to display
      const hasToolCalls = update.toolCalls && update.toolCalls.length > 0;

      if (hasToolCalls) {
        // For tool calls, create a simplified display with the formatted summary
        // but keep the tool call chips for visual indication
        const displayContent = this.formatToolCallMessage(update.toolCalls!);
        const fullContent = update.message.content || undefined;
        this.addMessage('assistant', displayContent || '(executing tools)', update.toolCalls, fullContent);
      } else {
        // Regular message without tool calls
        this.addMessage('assistant', update.message.content, undefined);
      }
    }

    // Map backend status to UI status
    let uiStatus: ConversationState['status'] = 'active';
    if (update.status === 'completed') {
      uiStatus = 'completed';
    } else if (update.status === 'error') {
      uiStatus = 'error';
    } else if (update.status === 'max_iterations') {
      uiStatus = 'max_iterations';
    } else if (update.status === 'cancelled') {
      uiStatus = 'cancelled';
    } else if (update.toolCalls && update.toolCalls.length > 0) {
      uiStatus = 'executing_tools';
    }

    this.setState({
      status: uiStatus,
      iterationCount: update.iterationCount,
      createdKnots: update.createdKnots,
      modifiedKnots: update.modifiedKnots,
      error: update.error || null,
      completionSummary: update.completionSummary || null,
      isLoading: false,
    });
  }

  /**
   * Format tool call results for display
   * Shows only essential info: tool name and for add/modify_knot shows the raw knot
   */
  private formatToolCallMessage(
    toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: string }>
  ): string {
    const parts: string[] = [];

    for (const call of toolCalls) {
      if (call.name === 'add_knot') {
        const knotName = call.arguments.name as string;
        const content = call.arguments.content as string;
        parts.push(`Created knot: ${knotName}\n\`\`\`ink\n=== ${knotName} ===\n${content}\n\`\`\``);
      } else if (call.name === 'modify_knot') {
        const knotName = call.arguments.name as string;
        const content = call.arguments.new_content as string;
        parts.push(`Modified knot: ${knotName}\n\`\`\`ink\n=== ${knotName} ===\n${content}\n\`\`\``);
      } else if (call.name === 'mark_goal_complete') {
        parts.push(`Goal completed: ${call.arguments.summary as string}`);
      } else if (call.name === 'generate_image') {
        parts.push(`Generated image: ${call.arguments.scene_description as string}`);
      } else {
        // For other tools (list_knots, get_knot_content, etc.), just show the tool name
        parts.push(`Used: ${call.name}`);
      }
    }

    return parts.join('\n\n');
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

    const message: ConversationDisplayMessage = {
      id: this.generateMessageId(),
      role,
      content: displayContent,
      fullContent: originalContent !== displayContent ? originalContent : undefined,
      timestamp: Date.now(),
      toolCalls,
    };

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
    promptLibrary?: ProjectPromptLibrary | null;
  }): Promise<boolean> {
    // Reset state
    this.setState({
      ...initialState,
      status: 'thinking',
      goal: config.goal,
      maxIterations: config.maxIterations,
      isLoading: true,
    });

    // Add user goal message (the goal may already contain context like "Continue from knot...")
    // The message will be cleaned for display but full content shown on hover
    this.addMessage('user', config.goal);

    try {
      const result = await window.electronAPI.startConversationSession({
        goal: config.goal,
        maxIterations: config.maxIterations,
        projectPath: config.projectPath,
        inkFilePath: config.inkFilePath,
        ollamaBaseUrl: config.ollamaBaseUrl,
        ollamaModel: config.ollamaModel,
        ollamaOptions: config.ollamaOptions,
        characterConfig: config.characterConfig,
        promptLibrary: config.promptLibrary,
      });

      if (result.success && result.sessionId) {
        this.setState({
          sessionId: result.sessionId,
          status: 'active',
          isLoading: false,
        });
        return true;
      } else {
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
   * Cleanup on unmount
   */
  cleanup(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];
    this.listeners.clear();
  }
}

// Export singleton instance
export const conversationService = new ConversationService();

// Export class for testing
export { ConversationService };
