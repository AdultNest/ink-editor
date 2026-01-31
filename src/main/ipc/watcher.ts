import { ipcMain, BrowserWindow } from 'electron';
import { watch, type FSWatcher } from 'chokidar';
import path from 'path';

/**
 * Represents a file system change event sent to the renderer
 */
export interface FileWatchEvent {
  type: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';
  path: string;
  name: string;
}

// Store the active watcher instance for cleanup
let activeWatcher: FSWatcher | null = null;

/**
 * Gets the main browser window for sending IPC events
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Sends a file watch event to the renderer process
 */
function sendWatchEvent(event: FileWatchEvent): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('watcher:change', event.type, event.path);
  }
}

/**
 * Stops the currently active watcher if one exists
 */
async function stopActiveWatcher(): Promise<void> {
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }
}

/**
 * Registers IPC handlers for file system watching
 * - watcher:start - Starts watching a directory for changes
 * - watcher:stop - Stops the active watcher
 */
export function registerWatcherHandlers(): void {
  // Handler for starting a directory watcher
  ipcMain.handle('watcher:start', async (_event, dirPath: string): Promise<boolean> => {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('Invalid directory path provided');
    }

    try {
      // Stop any existing watcher before starting a new one
      await stopActiveWatcher();

      // Create a new watcher for the directory
      // Using chokidar with sensible defaults for IDE-like behavior
      activeWatcher = watch(dirPath, {
        persistent: true,
        ignoreInitial: true, // Don't emit events for existing files on startup
        followSymlinks: true,
        depth: undefined, // Watch all subdirectories recursively
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
        // Ignore common noise directories for better performance
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/.vite/**',
        ],
      });

      // Set up event listeners
      activeWatcher
        .on('add', (filePath) => {
          sendWatchEvent({
            type: 'add',
            path: filePath,
            name: path.basename(filePath),
          });
        })
        .on('addDir', (filePath) => {
          sendWatchEvent({
            type: 'addDir',
            path: filePath,
            name: path.basename(filePath),
          });
        })
        .on('change', (filePath) => {
          sendWatchEvent({
            type: 'change',
            path: filePath,
            name: path.basename(filePath),
          });
        })
        .on('unlink', (filePath) => {
          sendWatchEvent({
            type: 'unlink',
            path: filePath,
            name: path.basename(filePath),
          });
        })
        .on('unlinkDir', (filePath) => {
          sendWatchEvent({
            type: 'unlinkDir',
            path: filePath,
            name: path.basename(filePath),
          });
        })
        .on('error', (error) => {
          // Ignore EPERM/ENOENT errors - these are expected when watched folders are deleted
          // These errors occur when the OS can no longer watch a deleted directory
          if (error && typeof error === 'object' && 'code' in error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EPERM' || code === 'ENOENT' || code === 'EACCES') {
              // Silently ignore these expected errors
              return;
            }
          }

          const message = error instanceof Error ? error.message : 'Unknown watcher error';
          // Log error but don't throw - watcher errors shouldn't crash the app
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('watcher:error', message);
          }
        });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start watcher for "${dirPath}": ${message}`);
    }
  });

  // Handler for stopping the active watcher
  ipcMain.handle('watcher:stop', async (): Promise<boolean> => {
    try {
      await stopActiveWatcher();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to stop watcher: ${message}`);
    }
  });
}

/**
 * Cleans up the watcher when the application is closing
 * Should be called during app shutdown
 */
export async function cleanupWatcher(): Promise<void> {
  await stopActiveWatcher();
}
