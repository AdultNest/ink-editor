import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerAllHandlers, cleanupWatcher } from './ipc';
import { registerLocalFileProtocol } from './protocol';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// Use try-catch because the module may not be available in all environments
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {
  // Module not available, skip squirrel startup handling
}

// Register all IPC handlers before app is ready
registerAllHandlers();

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Clean up watcher when this window closes
  // This prevents orphaned watchers that would continue running
  mainWindow.on('closed', () => {
    // Use void to handle the promise without blocking
    void cleanupWatcher();
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools in development.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register custom protocol for local file access
  registerLocalFileProtocol();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Clean up watcher when all windows are closed
  // On macOS, app stays running but watcher should stop since there's
  // no window to receive events
  void cleanupWatcher();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up resources before quitting
app.on('before-quit', async () => {
  await cleanupWatcher();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
