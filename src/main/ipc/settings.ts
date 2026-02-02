import { ipcMain, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

/**
 * Settings file path - stored in user data directory
 */
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

/**
 * Ollama LLM settings
 */
export interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * ComfyUI image generation settings
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
  lastOpened: number; // timestamp
}

/**
 * Application settings structure
 */
export interface AppSettings {
  lastOpenedFolder?: string;
  recentProjects?: RecentProject[];
  ollama?: OllamaSettings;
  comfyui?: ComfyUISettings;
}

/**
 * Default Ollama settings
 */
const DEFAULT_OLLAMA_SETTINGS: OllamaSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
  temperature: 0.7,
  maxTokens: 2048,
};

/**
 * Default ComfyUI settings
 */
const DEFAULT_COMFYUI_SETTINGS: ComfyUISettings = {
  enabled: false,
  baseUrl: 'http://localhost:8188',
  checkpointModel: '',
  defaultSteps: 20,
  defaultWidth: 512,
  defaultHeight: 512,
};

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AppSettings = {
  ollama: DEFAULT_OLLAMA_SETTINGS,
  comfyui: DEFAULT_COMFYUI_SETTINGS,
};

/**
 * Reads settings from disk
 */
export async function readSettings(): Promise<AppSettings> {
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

  // Get all settings
  ipcMain.handle('settings:getAll', async (): Promise<AppSettings> => {
    return await readSettings();
  });

  // Update settings (partial update)
  ipcMain.handle('settings:update', async (_event, updates: Partial<AppSettings>): Promise<AppSettings> => {
    const settings = await readSettings();

    // Deep merge for nested objects
    if (updates.ollama) {
      settings.ollama = { ...DEFAULT_OLLAMA_SETTINGS, ...settings.ollama, ...updates.ollama };
    }
    if (updates.comfyui) {
      settings.comfyui = { ...DEFAULT_COMFYUI_SETTINGS, ...settings.comfyui, ...updates.comfyui };
    }
    if (updates.lastOpenedFolder !== undefined) {
      settings.lastOpenedFolder = updates.lastOpenedFolder;
    }

    await writeSettings(settings);
    return settings;
  });

  // Add project to recent projects list
  ipcMain.handle('settings:addRecentProject', async (_event, projectPath: string): Promise<RecentProject[]> => {
    const settings = await readSettings();
    const recentProjects = settings.recentProjects || [];

    // Extract project name from path
    const name = path.basename(projectPath);

    // Remove existing entry for this path (if any)
    const filtered = recentProjects.filter(p => p.path !== projectPath);

    // Add new entry at the beginning
    const newEntry: RecentProject = {
      path: projectPath,
      name,
      lastOpened: Date.now(),
    };

    // Keep only the 10 most recent
    const updated = [newEntry, ...filtered].slice(0, 10);

    settings.recentProjects = updated;
    await writeSettings(settings);

    // Rebuild the application menu with updated recent projects
    const { rebuildMenu } = await import('./menu');
    rebuildMenu();

    return updated;
  });

  // Get recent projects
  ipcMain.handle('settings:getRecentProjects', async (): Promise<RecentProject[]> => {
    const settings = await readSettings();
    const recentProjects = settings.recentProjects || [];

    // Filter out projects that no longer exist
    const validProjects: RecentProject[] = [];
    for (const project of recentProjects) {
      try {
        const stats = await fs.stat(project.path);
        if (stats.isDirectory()) {
          validProjects.push(project);
        }
      } catch {
        // Project no longer exists, skip it
      }
    }

    // Update settings if some projects were removed
    if (validProjects.length !== recentProjects.length) {
      settings.recentProjects = validProjects;
      await writeSettings(settings);
    }

    return validProjects;
  });

  // Clear recent projects
  ipcMain.handle('settings:clearRecentProjects', async (): Promise<void> => {
    const settings = await readSettings();
    settings.recentProjects = [];
    await writeSettings(settings);

    // Rebuild the application menu
    const { rebuildMenu } = await import('./menu');
    rebuildMenu();
  });
}
