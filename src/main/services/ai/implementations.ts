/**
 * AI Service Implementations
 *
 * Concrete implementations of the AI service interfaces.
 * These bridge the abstract interfaces to actual Electron/Ollama/filesystem.
 */

import fs from 'fs/promises';
import { BrowserWindow } from 'electron';
import type {
  ILLMProvider,
  IFileService,
  INotificationService,
  LLMChatRequest,
  LLMChatResponse,
} from './interfaces';
import { ollamaChatAsync, type OllamaChatRequest } from '../../ipc/ollama';

// ============================================================================
// Ollama LLM Provider
// ============================================================================

/**
 * Configuration for Ollama provider
 */
export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

/**
 * Ollama LLM Provider implementation
 */
export class OllamaLLMProvider implements ILLMProvider {
  constructor(private config: OllamaProviderConfig) {}

  async chat(request: LLMChatRequest, timeout?: number): Promise<LLMChatResponse> {
    const ollamaRequest: OllamaChatRequest = {
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
      })),
      tools: request.tools,
      stream: false,
      options: {
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
      },
    };

    const response = await ollamaChatAsync(ollamaRequest, timeout);

    return {
      success: response.success,
      error: response.error,
      message: response.message,
      done: response.done,
      jsonParseErrors: response.jsonParseErrors,
    };
  }

  /**
   * Update configuration (e.g., change model)
   */
  updateConfig(config: Partial<OllamaProviderConfig>): void {
    if (config.baseUrl !== undefined) this.config.baseUrl = config.baseUrl;
    if (config.model !== undefined) this.config.model = config.model;
  }
}

/**
 * Create Ollama LLM provider
 */
export function createOllamaProvider(config: OllamaProviderConfig): OllamaLLMProvider {
  return new OllamaLLMProvider(config);
}

// ============================================================================
// Node File Service
// ============================================================================

/**
 * Node.js file service implementation
 */
export class NodeFileService implements IFileService {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Node file service
 */
export function createNodeFileService(): NodeFileService {
  return new NodeFileService();
}

// ============================================================================
// Electron Notification Service
// ============================================================================

/**
 * Electron notification service implementation
 * Uses BrowserWindow to send IPC messages to renderer
 */
export class ElectronNotificationService implements INotificationService {
  notifyFileChanged(filePath: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('conversation:file-changed', filePath);
    }
  }

  notifyContentChanged(filePath: string, content: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('conversation:content-changed', filePath, content);
    }
  }

  notifyConversationUpdate(sessionId: string, update: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('conversation:update', sessionId, update);
    }
  }
}

/**
 * Create Electron notification service
 */
export function createElectronNotificationService(): ElectronNotificationService {
  return new ElectronNotificationService();
}

// ============================================================================
// Editor File Service
// ============================================================================

/**
 * Content provider function type.
 * Requests current content from the editor for a given file path.
 */
export type EditorContentProvider = (filePath: string) => Promise<string | null>;

/**
 * Editor file service that reads from the editor and notifies it of changes.
 * Used during AI conversations to work with the editor's current state.
 *
 * - Reads request content from the editor via the content provider
 * - Writes notify the editor of content changes (no disk I/O)
 */
export class EditorFileService implements IFileService {
  private notificationService: INotificationService;
  private contentProvider: EditorContentProvider;
  private fallbackService: IFileService;

  constructor(
    contentProvider: EditorContentProvider,
    notificationService: INotificationService,
    fallbackService: IFileService
  ) {
    this.contentProvider = contentProvider;
    this.notificationService = notificationService;
    this.fallbackService = fallbackService;
  }

  async readFile(filePath: string): Promise<string> {
    // Request current content from the editor
    const editorContent = await this.contentProvider(filePath);
    if (editorContent !== null) {
      return editorContent;
    }
    // Fall back to disk if editor doesn't have the file
    return this.fallbackService.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    // Notify editor of content change (no disk I/O)
    this.notificationService.notifyContentChanged(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    // Check if editor has the file, otherwise check disk
    const editorContent = await this.contentProvider(filePath);
    if (editorContent !== null) {
      return true;
    }
    return this.fallbackService.exists(filePath);
  }
}

/**
 * Create an editor file service
 */
export function createEditorFileService(
  contentProvider: EditorContentProvider,
  notificationService: INotificationService,
  fallbackService: IFileService
): EditorFileService {
  return new EditorFileService(contentProvider, notificationService, fallbackService);
}

// ============================================================================
// Mock Implementations for Testing
// ============================================================================

/**
 * Mock LLM provider for testing
 */
export class MockLLMProvider implements ILLMProvider {
  private responses: LLMChatResponse[] = [];
  private callIndex = 0;
  public calls: LLMChatRequest[] = [];

  /**
   * Queue a response to return on the next chat call
   */
  queueResponse(response: LLMChatResponse): void {
    this.responses.push(response);
  }

  /**
   * Queue multiple responses
   */
  queueResponses(responses: LLMChatResponse[]): void {
    this.responses.push(...responses);
  }

  async chat(request: LLMChatRequest, _timeout?: number): Promise<LLMChatResponse> {
    this.calls.push(request);

    if (this.callIndex < this.responses.length) {
      return this.responses[this.callIndex++];
    }

    // Default response if no queued response
    return {
      success: true,
      message: { role: 'assistant', content: 'Mock response' },
      done: true,
    };
  }

  /**
   * Reset for reuse
   */
  reset(): void {
    this.responses = [];
    this.callIndex = 0;
    this.calls = [];
  }
}

/**
 * Mock file service for testing
 */
export class MockFileService implements IFileService {
  private files = new Map<string, string>();
  public readCalls: string[] = [];
  public writeCalls: Array<{ path: string; content: string }> = [];

  /**
   * Set file content
   */
  setFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  async readFile(filePath: string): Promise<string> {
    this.readCalls.push(filePath);
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.writeCalls.push({ path: filePath, content });
    this.files.set(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  /**
   * Reset for reuse
   */
  reset(): void {
    this.files.clear();
    this.readCalls = [];
    this.writeCalls = [];
  }
}

/**
 * Mock notification service for testing
 */
export class MockNotificationService implements INotificationService {
  public fileChanges: string[] = [];
  public contentChanges: Array<{ filePath: string; content: string }> = [];
  public conversationUpdates: Array<{ sessionId: string; update: unknown }> = [];

  notifyFileChanged(filePath: string): void {
    this.fileChanges.push(filePath);
  }

  notifyContentChanged(filePath: string, content: string): void {
    this.contentChanges.push({ filePath, content });
  }

  notifyConversationUpdate(sessionId: string, update: unknown): void {
    this.conversationUpdates.push({ sessionId, update });
  }

  /**
   * Reset for reuse
   */
  reset(): void {
    this.fileChanges = [];
    this.contentChanges = [];
    this.conversationUpdates = [];
  }
}
