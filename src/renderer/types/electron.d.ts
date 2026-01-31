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
}

// Augment the global Window interface to include electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
