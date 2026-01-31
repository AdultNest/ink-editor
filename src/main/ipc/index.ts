import { registerFileSystemHandlers } from './fileSystem';
import { registerWatcherHandlers, cleanupWatcher } from './watcher';
import { registerSettingsHandlers } from './settings';

/**
 * Registers all IPC handlers for the application
 * Should be called before app.on('ready') to ensure handlers are available
 */
export function registerAllHandlers(): void {
  registerFileSystemHandlers();
  registerWatcherHandlers();
  registerSettingsHandlers();
}

// Re-export individual registration functions for flexibility
export { registerFileSystemHandlers } from './fileSystem';
export { registerWatcherHandlers, cleanupWatcher } from './watcher';
export { registerSettingsHandlers } from './settings';

// Re-export types that may be needed elsewhere
export type { FileSystemEntry } from './fileSystem';
export type { FileWatchEvent } from './watcher';
