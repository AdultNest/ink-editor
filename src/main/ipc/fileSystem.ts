import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';

/**
 * Represents a file system entry returned from directory reading
 */
export interface FileSystemEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

/**
 * Registers IPC handlers for file system operations
 * - dialog:openFolder - Opens native folder selection dialog
 * - fs:readDir - Reads directory contents
 */
export function registerFileSystemHandlers(): void {
  // Handler for opening native folder selection dialog
  ipcMain.handle('dialog:openFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to open folder dialog: ${message}`);
    }
  });

  // Handler for reading directory contents
  ipcMain.handle('fs:readDir', async (_event, dirPath: string): Promise<FileSystemEntry[]> => {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('Invalid directory path provided');
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(dirPath, entry.name),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read directory "${dirPath}": ${message}`);
    }
  });

  // Handler for reading file contents
  ipcMain.handle('fs:readFile', async (_event, filePath: string): Promise<string> => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read file "${filePath}": ${message}`);
    }
  });

  // Handler for writing file contents
  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string): Promise<void> => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    if (typeof content !== 'string') {
      throw new Error('Invalid content provided');
    }

    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write file "${filePath}": ${message}`);
    }
  });

  // Handler for checking if a file exists
  ipcMain.handle('fs:fileExists', async (_event, filePath: string): Promise<boolean> => {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // Handler for creating a directory
  ipcMain.handle('fs:createDir', async (_event, dirPath: string): Promise<void> => {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('Invalid directory path provided');
    }

    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // If the directory already exists, that's fine
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create directory "${dirPath}": ${message}`);
    }
  });

  // Handler for creating a file (with optional initial content)
  ipcMain.handle('fs:createFile', async (_event, filePath: string, content: string = ''): Promise<void> => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    try {
      // Check if file already exists
      try {
        await fs.access(filePath);
        throw new Error(`File already exists: ${filePath}`);
      } catch (accessError) {
        // File doesn't exist, which is what we want
        if ((accessError as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw accessError;
        }
      }

      // Create the file
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create file "${filePath}": ${message}`);
    }
  });

  // Handler for copying a file
  ipcMain.handle('fs:copyFile', async (_event, sourcePath: string, destPath: string): Promise<void> => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('Invalid source path provided');
    }
    if (!destPath || typeof destPath !== 'string') {
      throw new Error('Invalid destination path provided');
    }

    try {
      await fs.copyFile(sourcePath, destPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to copy file from "${sourcePath}" to "${destPath}": ${message}`);
    }
  });

  // Handler for deleting a file or directory
  ipcMain.handle('fs:delete', async (_event, targetPath: string): Promise<void> => {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Invalid path provided');
    }

    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true });
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      // If the file/directory doesn't exist, consider deletion successful
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete "${targetPath}": ${message}`);
    }
  });

  // Handler for opening file selection dialog (for import)
  ipcMain.handle('dialog:openFiles', async (_event, options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiSelect?: boolean;
  }): Promise<string[] | null> => {
    try {
      const result = await dialog.showOpenDialog({
        title: options?.title || 'Select Files',
        properties: options?.multiSelect !== false ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: options?.filters,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to open file dialog: ${message}`);
    }
  });

  // Handler for showing a file/folder in system file explorer
  ipcMain.handle('shell:showInExplorer', async (_event, targetPath: string): Promise<void> => {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Invalid path provided');
    }

    // showItemInFolder opens the folder containing the file and selects it
    shell.showItemInFolder(targetPath);
  });
}
