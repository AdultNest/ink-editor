/**
 * TypeScript declarations for window.electronAPI
 *
 * This file augments the global Window interface to include the electronAPI
 * that is exposed by the preload script via contextBridge.
 */

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
  goal: string;
  maxIterations: number;
  projectPath: string;
  inkFilePath: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
  characterConfig?: unknown;
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
  completionSummary?: string;
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
   * @param fileExtensions - Optional list of file extensions to search
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

  // Recent Projects API
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

  // Menu Event Listeners
  /**
   * Registers a callback for menu:openFolder event
   */
  onMenuOpenFolder: (callback: () => void) => () => void;

  /**
   * Registers a callback for menu:save event
   */
  onMenuSave: (callback: () => void) => () => void;

  /**
   * Registers a callback for menu:openRecentProject event
   */
  onMenuOpenRecentProject: (callback: (projectPath: string) => void) => () => void;

  /**
   * Registers a callback for menu:clearRecentProjects event
   */
  onMenuClearRecentProjects: (callback: () => void) => () => void;

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
   * Registers a callback for conversation update events
   */
  onConversationUpdate: (callback: ConversationUpdateCallback) => () => void;

  /**
   * Registers a callback for file changes from conversation tools
   */
  onConversationFileChange: (callback: ConversationFileChangeCallback) => () => void;
}

// Augment the global Window interface to include electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
