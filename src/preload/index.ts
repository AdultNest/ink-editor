// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// This preload script runs before the renderer process and can safely expose
// selected Node.js/Electron APIs to the renderer via contextBridge.

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Type definition for file system entry returned from readDir
 */
export interface FileSystemEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

/**
 * Type definition for file watcher event types
 */
export type WatchEventType = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';

/**
 * Callback type for file change events
 */
export type FileChangeCallback = (eventType: WatchEventType, filePath: string) => void;

/**
 * Callback type for watcher error events
 */
export type WatcherErrorCallback = (errorMessage: string) => void;

/**
 * Ollama settings
 */
export interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Request timeout in seconds (default: 180) */
  timeoutSeconds?: number;
  /** Message history summarization threshold (default: 30) */
  summarizeAfterMessages?: number;
  /** Number of recent messages to keep when summarizing (default: 10) */
  keepRecentMessages?: number;
}

/**
 * ComfyUI settings
 */
export interface ComfyUISettings {
  enabled: boolean;
  baseUrl: string;
  checkpointModel: string;
  defaultSteps: number;
  defaultWidth: number;
  defaultHeight: number;
}

/**
 * Editor settings
 */
export interface EditorSettings {
  /** Maximum number of history entries to keep (default: 1000) */
  maxHistoryLength: number;
}

/**
 * Recent project entry
 */
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

/**
 * Represents a reference found in a file
 */
export interface FileReference {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Represents a reference update request
 */
export interface ReferenceUpdate {
  filePath: string;
  oldText: string;
  newText: string;
}

/**
 * Application settings
 */
export interface AppSettings {
  lastOpenedFolder?: string;
  recentProjects?: RecentProject[];
  ollama?: OllamaSettings;
  comfyui?: ComfyUISettings;
  editor?: EditorSettings;
}

/**
 * Ollama test result
 */
export interface OllamaTestResult {
  success: boolean;
  error?: string;
  models?: string[];
}

/**
 * ComfyUI test result
 */
export interface ComfyUITestResult {
  success: boolean;
  error?: string;
  checkpoints?: string[];
}

/**
 * Ollama generation request
 */
export interface OllamaGenerateRequest {
  baseUrl: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** Response format: 'json' for structured data, undefined for plain text */
  format?: 'json';
}

/**
 * Ollama generation response
 */
export interface OllamaGenerateResponse {
  success: boolean;
  error?: string;
  response?: string;
}

/**
 * ComfyUI workflow type
 */
export type ComfyUIWorkflowType = 'preview' | 'render';

/**
 * ComfyUI generation request
 */
export interface ComfyUIGenerateRequest {
  baseUrl: string;
  prompt: string;
  negativePrompt?: string;
  checkpointModel: string;
  steps?: number;
  width?: number;
  height?: number;
  seed?: number;
  /** Project path for loading custom workflow */
  projectPath?: string;
  /** Workflow type: 'preview' for quick 256px, 'render' for full ~512px with hi-res */
  workflowType?: ComfyUIWorkflowType;
}

/**
 * ComfyUI generation response
 */
export interface ComfyUIGenerateResponse {
  success: boolean;
  error?: string;
  promptId?: string;
}

/**
 * ComfyUI status response
 */
export interface ComfyUIStatusResponse {
  success: boolean;
  error?: string;
  status?: 'pending' | 'running' | 'completed' | 'error';
  imageFilename?: string;
  /** Subfolder for temp images (PreviewImage outputs) */
  imageSubfolder?: string;
  /** Image type: 'output' for SaveImage, 'temp' for PreviewImage */
  imageType?: 'output' | 'temp';
}

// ============================================================================
// Conversation Types
// ============================================================================

/**
 * Ollama message for conversation
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
}

/**
 * Configuration for starting a conversation session
 */
export interface ConversationSessionConfig {
  /** The user-defined goal */
  goal: string;
  /** Maximum iterations before stopping */
  maxIterations: number;
  /** Path to the project root */
  projectPath: string;
  /** Path to the ink file */
  inkFilePath: string;
  /** Ollama base URL */
  ollamaBaseUrl: string;
  /** Ollama model name */
  ollamaModel: string;
  /** Ollama generation options */
  ollamaOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
  /** Contact character AI config (optional) */
  characterConfig?: unknown;
  /** Player character AI config (optional) */
  playerCharacterConfig?: unknown;
  /** Prompt library (optional) */
  promptLibrary?: unknown;
}

/**
 * Session status
 */
export type ConversationSessionStatus = 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';

/**
 * Conversation session state
 */
export interface ConversationSessionState {
  sessionId: string;
  status: ConversationSessionStatus;
  goal: string;
  messages: OllamaMessage[];
  iterationCount: number;
  maxIterations: number;
  createdKnots: string[];
  modifiedKnots: string[];
  error?: string;
  createdAt?: number;
  lastActivityAt?: number;
}

/**
 * Result from a conversation turn
 */
export interface ConversationTurnResult {
  sessionId: string;
  status: ConversationSessionStatus;
  message?: OllamaMessage;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
  iterationCount: number;
  maxIterations: number;
  createdKnots: string[];
  modifiedKnots: string[];
  error?: string;
  /** Non-fatal warning message (e.g., LLM didn't call any tools) */
  warning?: string;
  completionSummary?: string;
  /** Info about history compaction if it occurred this turn */
  historyCompaction?: {
    occurred: boolean;
    messagesSummarized: number;
    messagesKept: number;
    summary: string;
  };
  /** Whether the AI is waiting for user response (from ask_user tool) */
  awaitingUserResponse?: boolean;
  /** The question being asked to the user (from ask_user tool) */
  userQuestion?: string;
}

/**
 * Callback type for conversation update events
 */
export type ConversationUpdateCallback = (sessionId: string, update: ConversationTurnResult) => void;

/**
 * Callback type for file change events from conversation
 */
export type ConversationFileChangeCallback = (filePath: string) => void;

/**
 * Callback type for content change events from conversation
 * Provides the new file content for the editor to update without disk I/O
 */
export type ConversationContentChangeCallback = (filePath: string, content: string) => void;

/**
 * Callback type for content request events from conversation.
 * The AI requests the current editor content for a file.
 * Returns the content or null if the file is not open in the editor.
 */
export type ConversationContentRequestCallback = (requestId: string, filePath: string) => void;

/**
 * Custom protocol name for local file access
 * Use this to construct URLs for local files (images, videos, etc.)
 */
export const LOCAL_FILE_PROTOCOL = 'local-file';

/**
 * ElectronAPI interface exposed to the renderer process
 * Provides secure access to file system operations via IPC
 */
export interface ElectronAPI {
  /**
   * Opens a native folder selection dialog
   * @returns The selected folder path, or null if canceled
   */
  openFolder: () => Promise<string | null>;

  /**
   * Reads the contents of a directory
   * @param dirPath - The absolute path to the directory
   * @returns Array of file system entries
   */
  readDir: (dirPath: string) => Promise<FileSystemEntry[]>;

  /**
   * Reads the contents of a file as text
   * @param filePath - The absolute path to the file
   * @returns The file contents as a string
   */
  readFile: (filePath: string) => Promise<string>;

  /**
   * Writes content to a file
   * @param filePath - The absolute path to the file
   * @param content - The content to write
   */
  writeFile: (filePath: string, content: string) => Promise<void>;

  /**
   * Checks if a file exists
   * @param filePath - The absolute path to the file
   * @returns True if the file exists
   */
  fileExists: (filePath: string) => Promise<boolean>;

  /**
   * Gets the last opened folder path
   * @returns The folder path, or null if none saved
   */
  getLastFolder: () => Promise<string | null>;

  /**
   * Saves the last opened folder path
   * @param folderPath - The folder path to save, or null to clear
   */
  setLastFolder: (folderPath: string | null) => Promise<void>;

  /**
   * Converts a file path to a local-file:// URL for media loading
   * @param filePath - The absolute file path
   * @returns The local-file:// URL
   */
  getLocalFileUrl: (filePath: string) => string;

  /**
   * Starts watching a directory for file system changes
   * @param dirPath - The absolute path to the directory to watch
   * @returns True if watcher started successfully
   */
  startWatcher: (dirPath: string) => Promise<boolean>;

  /**
   * Stops the currently active file watcher
   * @returns True if watcher stopped successfully
   */
  stopWatcher: () => Promise<boolean>;

  /**
   * Registers a callback for file system change events
   * @param callback - Function called when files are added, changed, or removed
   * @returns Cleanup function to remove the listener
   */
  onFileChange: (callback: FileChangeCallback) => () => void;

  /**
   * Registers a callback for watcher error events
   * @param callback - Function called when a watcher error occurs
   * @returns Cleanup function to remove the listener
   */
  onWatcherError: (callback: WatcherErrorCallback) => () => void;

  /**
   * Creates a new directory
   * @param dirPath - The absolute path for the new directory
   */
  createDir: (dirPath: string) => Promise<void>;

  /**
   * Creates a new file with optional initial content
   * @param filePath - The absolute path for the new file
   * @param content - Optional initial content for the file
   */
  createFile: (filePath: string, content?: string) => Promise<void>;

  /**
   * Copies a file from source to destination
   * @param sourcePath - The source file path
   * @param destPath - The destination file path
   */
  copyFile: (sourcePath: string, destPath: string) => Promise<void>;

  /**
   * Deletes a file or directory
   * @param targetPath - The path to delete
   */
  delete: (targetPath: string) => Promise<void>;

  /**
   * Renames a file or directory
   * @param oldPath - The current path
   * @param newPath - The new path
   */
  rename: (oldPath: string, newPath: string) => Promise<void>;

  /**
   * Finds references to a file in the project
   * @param projectPath - The project root path to search in
   * @param searchTerm - The term to search for (e.g., filename)
   * @param fileExtensions - Optional list of file extensions to search (default: .json, .ink, .conf)
   */
  findReferences: (
    projectPath: string,
    searchTerm: string,
    fileExtensions?: string[]
  ) => Promise<FileReference[]>;

  /**
   * Updates references in multiple files
   * @param updates - Array of reference updates to apply
   */
  updateReferences: (
    updates: ReferenceUpdate[]
  ) => Promise<{ success: boolean; errors: string[] }>;

  /**
   * Opens a file selection dialog
   * @param options - Dialog options
   * @returns Array of selected file paths, or null if canceled
   */
  openFiles: (options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiSelect?: boolean;
  }) => Promise<string[] | null>;

  /**
   * Shows a file or folder in the system file explorer
   * @param targetPath - The path to show
   */
  showInExplorer: (targetPath: string) => Promise<void>;

  // Settings API
  /**
   * Gets all application settings
   */
  getSettings: () => Promise<AppSettings>;

  /**
   * Updates application settings (partial update)
   */
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>;

  /**
   * Adds a project to the recent projects list
   */
  addRecentProject: (projectPath: string) => Promise<RecentProject[]>;

  /**
   * Gets the list of recent projects
   */
  getRecentProjects: () => Promise<RecentProject[]>;

  /**
   * Clears all recent projects
   */
  clearRecentProjects: () => Promise<void>;

  /**
   * Registers a callback for menu events
   */
  onMenuOpenFolder: (callback: () => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
  onMenuOpenRecentProject: (callback: (projectPath: string) => void) => () => void;
  onMenuClearRecentProjects: (callback: () => void) => () => void;

  // Ollama API
  /**
   * Tests Ollama connection and returns available models
   */
  testOllama: (baseUrl: string) => Promise<OllamaTestResult>;

  /**
   * Generates text using Ollama
   */
  generateWithOllama: (request: OllamaGenerateRequest) => Promise<OllamaGenerateResponse>;

  // ComfyUI API
  /**
   * Tests ComfyUI connection and returns available checkpoints
   */
  testComfyUI: (baseUrl: string) => Promise<ComfyUITestResult>;

  /**
   * Queues image generation with ComfyUI
   */
  generateWithComfyUI: (request: ComfyUIGenerateRequest) => Promise<ComfyUIGenerateResponse>;

  /**
   * Checks status of a ComfyUI generation
   */
  getComfyUIStatus: (baseUrl: string, promptId: string) => Promise<ComfyUIStatusResponse>;

  /**
   * Downloads a generated image from ComfyUI
   */
  downloadComfyUIImage: (
    baseUrl: string,
    filename: string,
    destFolder: string,
    destFilename: string
  ) => Promise<{ success: boolean; error?: string; savedPath?: string }>;

  /**
   * Ensures the ComfyUI workflow files exist in the project
   * Creates default ones if they don't exist
   */
  ensureComfyUIWorkflow: (
    projectPath: string
  ) => Promise<{ success: boolean; created: string[]; paths: Record<ComfyUIWorkflowType, string>; error?: string }>;

  /**
   * Fetches an image from ComfyUI as base64 (avoids CORS issues)
   */
  fetchComfyUIImageBase64: (
    baseUrl: string,
    filename: string,
    subfolder?: string,
    type?: string
  ) => Promise<{ success: boolean; base64?: string; error?: string }>;

  // Conversation API
  /**
   * Starts a new conversation session for AI-assisted generation
   */
  startConversationSession: (
    config: ConversationSessionConfig
  ) => Promise<{ success: boolean; sessionId?: string; error?: string }>;

  /**
   * Continues a conversation session (runs next turn)
   */
  continueConversation: (
    sessionId: string,
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ) => Promise<ConversationTurnResult>;

  /**
   * Sends a user message to the conversation
   */
  sendConversationMessage: (
    sessionId: string,
    message: string,
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ) => Promise<ConversationTurnResult>;

  /**
   * Gets the current state of a conversation session
   */
  getConversationState: (sessionId: string) => Promise<ConversationSessionState | null>;

  /**
   * Cancels a conversation session
   */
  cancelConversationSession: (sessionId: string) => Promise<boolean>;

  /**
   * Ends and deletes a conversation session
   */
  endConversationSession: (sessionId: string) => Promise<boolean>;

  /**
   * Lists all conversation sessions (optionally filtered by ink file)
   */
  listConversationSessions: (inkFilePath?: string) => Promise<ConversationSessionState[]>;

  /**
   * Registers a callback for conversation update events
   */
  onConversationUpdate: (callback: ConversationUpdateCallback) => () => void;

  /**
   * Registers a callback for file changes from conversation tools
   */
  onConversationFileChange: (callback: ConversationFileChangeCallback) => () => void;

  /**
   * Registers a callback for content changes from conversation tools.
   * This is used when AI modifies file content - the content is sent directly
   * to the editor without writing to disk.
   */
  onConversationContentChange: (callback: ConversationContentChangeCallback) => () => void;

  /**
   * Registers a callback for content requests from conversation tools.
   * The AI requests the current editor content to read the latest state.
   */
  onConversationContentRequest: (callback: ConversationContentRequestCallback) => () => void;

  /**
   * Responds to a content request with the current editor content.
   * @param requestId - The request ID from the content request callback
   * @param content - The current content, or null if file is not open
   */
  respondToContentRequest: (requestId: string, content: string | null) => void;
}

// Expose the electronAPI to the renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Open native folder selection dialog
  openFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:openFolder');
  },

  // Read directory contents
  readDir: (dirPath: string): Promise<FileSystemEntry[]> => {
    return ipcRenderer.invoke('fs:readDir', dirPath);
  },

  // Read file contents
  readFile: (filePath: string): Promise<string> => {
    return ipcRenderer.invoke('fs:readFile', filePath);
  },

  // Write file contents
  writeFile: (filePath: string, content: string): Promise<void> => {
    return ipcRenderer.invoke('fs:writeFile', filePath, content);
  },

  // Check if file exists
  fileExists: (filePath: string): Promise<boolean> => {
    return ipcRenderer.invoke('fs:fileExists', filePath);
  },

  // Get last opened folder
  getLastFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('settings:getLastFolder');
  },

  // Save last opened folder
  setLastFolder: (folderPath: string | null): Promise<void> => {
    return ipcRenderer.invoke('settings:setLastFolder', folderPath);
  },

  // Convert file path to local-file:// URL
  getLocalFileUrl: (filePath: string): string => {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const encodedPath = normalizedPath
      .split('/')
      .map((segment, index) => {
        // Don't encode Windows drive letter (e.g., "D:")
        if (index === 0 && /^[A-Za-z]:$/.test(segment)) {
          return segment;
        }
        return encodeURIComponent(segment);
      })
      .join('/');
    return `${LOCAL_FILE_PROTOCOL}:///${encodedPath}`;
  },

  // Start watching a directory
  startWatcher: (dirPath: string): Promise<boolean> => {
    return ipcRenderer.invoke('watcher:start', dirPath);
  },

  // Stop the active watcher
  stopWatcher: (): Promise<boolean> => {
    return ipcRenderer.invoke('watcher:stop');
  },

  // Register callback for file change events
  onFileChange: (callback: FileChangeCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      eventType: WatchEventType,
      filePath: string
    ): void => {
      callback(eventType, filePath);
    };
    ipcRenderer.on('watcher:change', listener);
    // Return cleanup function to remove the listener
    return () => {
      ipcRenderer.removeListener('watcher:change', listener);
    };
  },

  // Register callback for watcher error events
  onWatcherError: (callback: WatcherErrorCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      errorMessage: string
    ): void => {
      callback(errorMessage);
    };
    ipcRenderer.on('watcher:error', listener);
    // Return cleanup function to remove the listener
    return () => {
      ipcRenderer.removeListener('watcher:error', listener);
    };
  },

  // Create a new directory
  createDir: (dirPath: string): Promise<void> => {
    return ipcRenderer.invoke('fs:createDir', dirPath);
  },

  // Create a new file
  createFile: (filePath: string, content?: string): Promise<void> => {
    return ipcRenderer.invoke('fs:createFile', filePath, content || '');
  },

  // Copy a file
  copyFile: (sourcePath: string, destPath: string): Promise<void> => {
    return ipcRenderer.invoke('fs:copyFile', sourcePath, destPath);
  },

  // Delete a file or directory
  delete: (targetPath: string): Promise<void> => {
    return ipcRenderer.invoke('fs:delete', targetPath);
  },

  // Rename a file or directory
  rename: (oldPath: string, newPath: string): Promise<void> => {
    return ipcRenderer.invoke('fs:rename', oldPath, newPath);
  },

  // Find references to a file in the project
  findReferences: (
    projectPath: string,
    searchTerm: string,
    fileExtensions?: string[]
  ): Promise<FileReference[]> => {
    return ipcRenderer.invoke('fs:findReferences', projectPath, searchTerm, fileExtensions);
  },

  // Update references in multiple files
  updateReferences: (
    updates: ReferenceUpdate[]
  ): Promise<{ success: boolean; errors: string[] }> => {
    return ipcRenderer.invoke('fs:updateReferences', updates);
  },

  // Open file selection dialog
  openFiles: (options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiSelect?: boolean;
  }): Promise<string[] | null> => {
    return ipcRenderer.invoke('dialog:openFiles', options);
  },

  // Show file/folder in system file explorer
  showInExplorer: (targetPath: string): Promise<void> => {
    return ipcRenderer.invoke('shell:showInExplorer', targetPath);
  },

  // Get all settings
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('settings:getAll');
  },

  // Update settings
  updateSettings: (updates: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke('settings:update', updates);
  },

  // Test Ollama connection
  testOllama: (baseUrl: string): Promise<OllamaTestResult> => {
    return ipcRenderer.invoke('ai:ollama:test', baseUrl);
  },

  // Generate with Ollama
  generateWithOllama: (request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> => {
    return ipcRenderer.invoke('ai:ollama:generate', request);
  },

  // Test ComfyUI connection
  testComfyUI: (baseUrl: string): Promise<ComfyUITestResult> => {
    return ipcRenderer.invoke('ai:comfyui:test', baseUrl);
  },

  // Generate with ComfyUI
  generateWithComfyUI: (request: ComfyUIGenerateRequest): Promise<ComfyUIGenerateResponse> => {
    return ipcRenderer.invoke('ai:comfyui:generate', request);
  },

  // Check ComfyUI status
  getComfyUIStatus: (baseUrl: string, promptId: string): Promise<ComfyUIStatusResponse> => {
    return ipcRenderer.invoke('ai:comfyui:status', baseUrl, promptId);
  },

  // Download ComfyUI image
  downloadComfyUIImage: (
    baseUrl: string,
    filename: string,
    destFolder: string,
    destFilename: string
  ): Promise<{ success: boolean; error?: string; savedPath?: string }> => {
    return ipcRenderer.invoke('ai:comfyui:download', baseUrl, filename, destFolder, destFilename);
  },

  // Ensure ComfyUI workflow files exist
  ensureComfyUIWorkflow: (
    projectPath: string
  ): Promise<{ success: boolean; created: string[]; paths: Record<ComfyUIWorkflowType, string>; error?: string }> => {
    return ipcRenderer.invoke('ai:comfyui:ensureWorkflow', projectPath);
  },

  // Fetch ComfyUI image as base64
  fetchComfyUIImageBase64: (
    baseUrl: string,
    filename: string,
    subfolder?: string,
    type?: string
  ): Promise<{ success: boolean; base64?: string; error?: string }> => {
    return ipcRenderer.invoke('ai:comfyui:fetchImageBase64', baseUrl, filename, subfolder, type);
  },

  // Start conversation session
  startConversationSession: (
    config: ConversationSessionConfig
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    return ipcRenderer.invoke('conversation:start', config);
  },

  // Continue conversation
  continueConversation: (
    sessionId: string,
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ): Promise<ConversationTurnResult> => {
    return ipcRenderer.invoke('conversation:continue', sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
  },

  // Send message to conversation
  sendConversationMessage: (
    sessionId: string,
    message: string,
    ollamaBaseUrl: string,
    ollamaModel: string,
    ollamaOptions?: { temperature?: number; maxTokens?: number }
  ): Promise<ConversationTurnResult> => {
    return ipcRenderer.invoke('conversation:send', sessionId, message, ollamaBaseUrl, ollamaModel, ollamaOptions);
  },

  // Get conversation state
  getConversationState: (sessionId: string): Promise<ConversationSessionState | null> => {
    return ipcRenderer.invoke('conversation:getState', sessionId);
  },

  // Cancel conversation
  cancelConversationSession: (sessionId: string): Promise<boolean> => {
    return ipcRenderer.invoke('conversation:cancel', sessionId);
  },

  // End conversation
  endConversationSession: (sessionId: string): Promise<boolean> => {
    return ipcRenderer.invoke('conversation:end', sessionId);
  },

  // List conversation sessions
  listConversationSessions: (inkFilePath?: string): Promise<ConversationSessionState[]> => {
    return ipcRenderer.invoke('conversation:listSessions', inkFilePath);
  },

  // Conversation update listener
  onConversationUpdate: (callback: ConversationUpdateCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      sessionId: string,
      update: ConversationTurnResult
    ): void => {
      callback(sessionId, update);
    };
    ipcRenderer.on('conversation:update', listener);
    return () => ipcRenderer.removeListener('conversation:update', listener);
  },

  // Conversation file change listener
  onConversationFileChange: (callback: ConversationFileChangeCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      filePath: string
    ): void => {
      callback(filePath);
    };
    ipcRenderer.on('conversation:file-changed', listener);
    return () => ipcRenderer.removeListener('conversation:file-changed', listener);
  },

  // Conversation content change listener (for AI updates without disk I/O)
  onConversationContentChange: (callback: ConversationContentChangeCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      filePath: string,
      content: string
    ): void => {
      callback(filePath, content);
    };
    ipcRenderer.on('conversation:content-changed', listener);
    return () => ipcRenderer.removeListener('conversation:content-changed', listener);
  },

  // Conversation content request listener (AI requesting current editor content)
  onConversationContentRequest: (callback: ConversationContentRequestCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      requestId: string,
      filePath: string
    ): void => {
      callback(requestId, filePath);
    };
    ipcRenderer.on('conversation:request-content', listener);
    return () => ipcRenderer.removeListener('conversation:request-content', listener);
  },

  // Respond to content request
  respondToContentRequest: (requestId: string, content: string | null): void => {
    ipcRenderer.send('conversation:content-response', requestId, content);
  },

  // Add project to recent list
  addRecentProject: (projectPath: string): Promise<RecentProject[]> => {
    return ipcRenderer.invoke('settings:addRecentProject', projectPath);
  },

  // Get recent projects
  getRecentProjects: (): Promise<RecentProject[]> => {
    return ipcRenderer.invoke('settings:getRecentProjects');
  },

  // Clear recent projects
  clearRecentProjects: (): Promise<void> => {
    return ipcRenderer.invoke('settings:clearRecentProjects');
  },

  // Menu event listeners
  onMenuOpenFolder: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('menu:openFolder', listener);
    return () => ipcRenderer.removeListener('menu:openFolder', listener);
  },

  onMenuSave: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('menu:save', listener);
    return () => ipcRenderer.removeListener('menu:save', listener);
  },

  onMenuOpenRecentProject: (callback: (projectPath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, projectPath: string): void => callback(projectPath);
    ipcRenderer.on('menu:openRecentProject', listener);
    return () => ipcRenderer.removeListener('menu:openRecentProject', listener);
  },

  onMenuClearRecentProjects: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('menu:clearRecentProjects', listener);
    return () => ipcRenderer.removeListener('menu:clearRecentProjects', listener);
  },
} satisfies ElectronAPI);
