import { registerFileSystemHandlers } from './fileSystem';
import { registerWatcherHandlers, cleanupWatcher } from './watcher';
import { registerSettingsHandlers } from './settings';
import { registerAIHandlers } from './ai';
import { registerConversationHandlers } from './aiConversation';
import { initializeMenu } from './menu';

/**
 * Registers all IPC handlers for the application
 * Should be called before app.on('ready') to ensure handlers are available
 */
export function registerAllHandlers(): void {
  registerFileSystemHandlers();
  registerWatcherHandlers();
  registerSettingsHandlers();
  registerAIHandlers();
  registerConversationHandlers();
  initializeMenu();
}

// Re-export individual registration functions for flexibility
export { registerFileSystemHandlers } from './fileSystem';
export { registerWatcherHandlers, cleanupWatcher } from './watcher';
export { registerSettingsHandlers } from './settings';
export { registerAIHandlers } from './ai';
export { registerConversationHandlers } from './aiConversation';

// Re-export types that may be needed elsewhere
export type { FileSystemEntry, FileReference, ReferenceUpdate } from './fileSystem';
export type { FileWatchEvent } from './watcher';
export type { AppSettings, OllamaSettings, ComfyUISettings, RecentProject } from './settings';
export type {
  OllamaTestResult,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaChatMessage,
  ComfyUITestResult,
  ComfyUIGenerateRequest,
  ComfyUIGenerateResponse,
  ComfyUIStatusResponse,
} from './ai';
export type { ConversationTurnResult, ConversationSessionState } from './aiConversation';
export type { ConversationSession, SessionConfig, OllamaMessage, OllamaToolCall } from './aiSessionManager';
