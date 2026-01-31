import { ipcMain, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

/**
 * Settings file path - stored in user data directory
 */
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

/**
 * Application settings structure
 */
interface AppSettings {
  lastOpenedFolder?: string;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AppSettings = {};

/**
 * Reads settings from disk
 */
async function readSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    // File doesn't exist or is invalid, return defaults
    return DEFAULT_SETTINGS;
  }
}

/**
 * Writes settings to disk
 */
async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Registers IPC handlers for settings operations
 */
export function registerSettingsHandlers(): void {
  // Get last opened folder
  ipcMain.handle('settings:getLastFolder', async (): Promise<string | null> => {
    const settings = await readSettings();

    // Verify the folder still exists
    if (settings.lastOpenedFolder) {
      try {
        const stats = await fs.stat(settings.lastOpenedFolder);
        if (stats.isDirectory()) {
          return settings.lastOpenedFolder;
        }
      } catch {
        // Folder no longer exists
      }
    }

    return null;
  });

  // Save last opened folder
  ipcMain.handle('settings:setLastFolder', async (_event, folderPath: string | null): Promise<void> => {
    const settings = await readSettings();
    settings.lastOpenedFolder = folderPath || undefined;
    await writeSettings(settings);
  });
}
