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
      .map((segment) => encodeURIComponent(segment))
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
} satisfies ElectronAPI);
