/**
 * AI Service Interfaces
 *
 * Defines abstractions for AI conversation components.
 * These interfaces enable dependency injection and unit testing.
 */

/**
 * LLM message format
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LLMToolCall[];
}

/**
 * LLM tool call
 */
export interface LLMToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Tool definition for LLM
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
}

/**
 * Result from tool execution
 */
export interface ToolResult {
  success: boolean;
  result: string;
  error?: string;
  /** Optional metadata for special handling */
  metadata?: {
    goalComplete?: boolean;
    summary?: string;
    [key: string]: unknown;
  };
}

/**
 * LLM chat request
 */
export interface LLMChatRequest {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * LLM chat response
 */
export interface LLMChatResponse {
  success: boolean;
  error?: string;
  message?: LLMMessage;
  done?: boolean;
  /** JSON parse errors encountered when parsing tool calls from text */
  jsonParseErrors?: Array<{ error: string; originalJson: string }>;
}

/**
 * Interface for LLM providers (Ollama, OpenAI, etc.)
 */
export interface ILLMProvider {
  /**
   * Send a chat request to the LLM
   */
  chat(request: LLMChatRequest, timeout?: number): Promise<LLMChatResponse>;
}

/**
 * Context provided to tool executors
 */
export interface ToolExecutionContext {
  /** Path to the project root */
  projectPath: string;
  /** Path to the ink file being edited */
  inkFilePath: string;
  /** Session ID for tracking */
  sessionId: string;
  /** File service for reading/writing files */
  fileService: IFileService;
  /** Notification service for UI updates */
  notificationService: INotificationService;
  /** Any additional context data */
  data?: Record<string, unknown>;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  context: ToolExecutionContext,
  args: Record<string, unknown>
) => Promise<ToolResult>;

/**
 * Interface for tool providers
 */
export interface IToolProvider {
  /**
   * Get all tool definitions for LLM
   */
  getToolDefinitions(): ToolDefinition[];

  /**
   * Execute a tool by name
   */
  executeTool(
    context: ToolExecutionContext,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;

  /**
   * Get list of tool names that count towards iteration limits
   * (e.g., content-creating tools like add_knot, modify_knot)
   */
  getIterationCountingTools(): string[];
}

/**
 * Interface for file operations
 */
export interface IFileService {
  /**
   * Read file contents as string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Write string content to file
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(filePath: string): Promise<boolean>;
}

/**
 * Interface for notification/event service
 */
export interface INotificationService {
  /**
   * Notify about file changes (legacy - only signals that a file changed)
   */
  notifyFileChanged(filePath: string): void;

  /**
   * Notify about content changes with the new content.
   * This is used by AI tools to send updated content to the frontend
   * without writing to disk - the user decides when to save.
   */
  notifyContentChanged(filePath: string, content: string): void;

  /**
   * Notify about conversation updates
   */
  notifyConversationUpdate(sessionId: string, update: unknown): void;
}

/**
 * Session status
 */
export type SessionStatus = 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';

/**
 * Conversation session state
 */
export interface ConversationSession {
  /** Unique session ID */
  id: string;
  /** Chat messages in this session */
  messages: LLMMessage[];
  /** The user-defined goal for this session */
  goal: string;
  /** Current iteration count */
  iterationCount: number;
  /** Maximum allowed iterations */
  maxIterations: number;
  /** Session status */
  status: SessionStatus;
  /** Path to the project root */
  projectPath: string;
  /** Path to the ink file being edited */
  inkFilePath: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Custom session data (e.g., createdKnots, modifiedKnots) */
  data: Record<string, unknown>;
}

/**
 * Configuration for creating a new session
 */
export interface SessionConfig {
  goal: string;
  maxIterations: number;
  projectPath: string;
  inkFilePath: string;
  /** Initial custom data */
  data?: Record<string, unknown>;
}

/**
 * System prompt builder function type
 */
export type SystemPromptBuilder = (session: ConversationSession) => string;

/**
 * Conversation turn result
 */
export interface ConversationTurnResult {
  sessionId: string;
  status: SessionStatus;
  message?: LLMMessage;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
  iterationCount: number;
  maxIterations: number;
  /** Knots created during this session */
  createdKnots: string[];
  /** Knots modified during this session */
  modifiedKnots: string[];
  error?: string;
  /** Non-fatal warning message (e.g., LLM didn't call any tools) */
  warning?: string;
  completionSummary?: string;
  /** Custom data from session */
  data?: Record<string, unknown>;
  /** Info about history compaction if it occurred this turn */
  historyCompaction?: {
    /** Whether compaction occurred */
    occurred: boolean;
    /** Number of messages that were summarized */
    messagesSummarized: number;
    /** Number of messages kept verbatim */
    messagesKept: number;
    /** The summary that replaced older messages */
    summary: string;
  };
  /** Whether the AI is waiting for user response (from ask_user tool) */
  awaitingUserResponse?: boolean;
  /** The question being asked to the user (from ask_user tool) */
  userQuestion?: string;
}

/**
 * Conversation engine configuration
 */
export interface ConversationEngineConfig {
  llmProvider: ILLMProvider;
  toolProvider: IToolProvider;
  fileService: IFileService;
  notificationService: INotificationService;
  systemPromptBuilder: SystemPromptBuilder;
  /** LLM options */
  llmOptions?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
  /** Message history summarization options */
  summarizationOptions?: {
    /** Trigger summarization when message count exceeds this (default: 30) */
    messageThreshold?: number;
    /** Number of recent messages to keep intact (default: 10) */
    recentMessagesToKeep?: number;
  };
  /** Timeout in seconds (for display in system prompt) */
  timeoutSeconds?: number;
}
