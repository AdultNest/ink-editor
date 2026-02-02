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

  // Handler for renaming a file or directory
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    if (!oldPath || typeof oldPath !== 'string') {
      throw new Error('Invalid source path provided');
    }
    if (!newPath || typeof newPath !== 'string') {
      throw new Error('Invalid destination path provided');
    }

    try {
      // Check if destination already exists
      try {
        await fs.access(newPath);
        throw new Error(`A file or folder already exists at: ${newPath}`);
      } catch (accessError) {
        // Destination doesn't exist, which is what we want
        if ((accessError as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw accessError;
        }
      }

      await fs.rename(oldPath, newPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to rename "${oldPath}" to "${newPath}": ${message}`);
    }
  });

  // Handler for finding references to a file in the project
  ipcMain.handle('fs:findReferences', async (
    _event,
    projectPath: string,
    searchTerm: string,
    fileExtensions?: string[]
  ): Promise<FileReference[]> => {
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Invalid project path provided');
    }
    if (!searchTerm || typeof searchTerm !== 'string') {
      throw new Error('Invalid search term provided');
    }

    const references: FileReference[] = [];
    const extensions = fileExtensions || ['.json', '.ink', '.conf'];

    // Recursively search for references
    async function searchDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            // Skip node_modules, .git, etc.
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
              continue;
            }
            await searchDirectory(entryPath);
          } else {
            // Check if file has a matching extension
            const ext = path.extname(entry.name).toLowerCase();
            if (!extensions.includes(ext)) {
              continue;
            }

            try {
              const content = await fs.readFile(entryPath, 'utf-8');

              // Search for the term in the file content
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let index = line.indexOf(searchTerm);

                while (index !== -1) {
                  references.push({
                    filePath: entryPath,
                    lineNumber: i + 1,
                    lineContent: line.trim(),
                    matchStart: index,
                    matchEnd: index + searchTerm.length,
                  });
                  // Find next occurrence in the same line
                  index = line.indexOf(searchTerm, index + 1);
                }
              }
            } catch {
              // Skip files that can't be read
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    }

    await searchDirectory(projectPath);
    return references;
  });

  // Handler for updating references in multiple files
  ipcMain.handle('fs:updateReferences', async (
    _event,
    updates: ReferenceUpdate[]
  ): Promise<{ success: boolean; errors: string[] }> => {
    const errors: string[] = [];

    // Group updates by file path
    const updatesByFile = new Map<string, ReferenceUpdate[]>();
    for (const update of updates) {
      const existing = updatesByFile.get(update.filePath) || [];
      existing.push(update);
      updatesByFile.set(update.filePath, existing);
    }

    // Process each file
    for (const [filePath, fileUpdates] of updatesByFile) {
      try {
        let content = await fs.readFile(filePath, 'utf-8');

        // Replace all occurrences of oldText with newText
        for (const update of fileUpdates) {
          content = content.split(update.oldText).join(update.newText);
        }

        await fs.writeFile(filePath, content, 'utf-8');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to update "${filePath}": ${message}`);
      }
    }

    return { success: errors.length === 0, errors };
  });
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
