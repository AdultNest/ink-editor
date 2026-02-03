/**
 * AI Services - Public API
 *
 * Re-exports all public types and classes from the AI services module.
 */

// Interfaces
export type {
  LLMMessage,
  LLMToolCall,
  ToolDefinition,
  ToolParameter,
  ToolResult,
  LLMChatRequest,
  LLMChatResponse,
  ILLMProvider,
  ToolExecutionContext,
  ToolExecutor,
  IToolProvider,
  IFileService,
  INotificationService,
  SessionStatus,
  ConversationSession,
  SessionConfig,
  SystemPromptBuilder,
  ConversationTurnResult,
  ConversationEngineConfig,
} from './interfaces';

// Session Manager
export {
  SessionManager,
  InMemorySessionStorage,
  getSessionManager,
  resetSessionManager,
  type ISessionStorage,
} from './sessionManager';

// Conversation Engine
export {
  ConversationEngine,
  createConversationEngine,
} from './conversationEngine';

// Ink Tool Provider
export {
  InkToolProvider,
  createInkToolProvider,
} from './inkToolProvider';

// Implementations
export {
  OllamaLLMProvider,
  createOllamaProvider,
  NodeFileService,
  createNodeFileService,
  ElectronNotificationService,
  createElectronNotificationService,
  // Editor file service for AI conversations (reads from editor, notifies of changes)
  EditorFileService,
  createEditorFileService,
  // Mock implementations for testing
  MockLLMProvider,
  MockFileService,
  MockNotificationService,
} from './implementations';

export type { EditorContentProvider } from './implementations';

export type { OllamaProviderConfig } from './implementations';
