/**
 * useFileTree hook for file tree state management and IPC integration
 *
 * Provides:
 * - State management for file tree data
 * - IPC integration for folder dialog, directory reading, and file watching
 * - Lazy loading of directory contents when folders are expanded
 * - Auto-updating tree when file system changes are detected
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FileSystemEntry, WatchEventType } from '../types/electron.d.ts';
import {
  type FileTreeNode,
  transformToTreeData,
  updateNodeChildren,
  addNodeToTree,
  removeNodeFromTree,
  createNodeFromPath,
  getParentPath,
} from '../components/FileTree/types';
import { PROMPT_LIBRARY_FILENAME, getDefaultLibrary, promptLibraryService } from '../services';

/**
 * State returned by the useFileTree hook
 */
export interface UseFileTreeState {
  /** The root folder path that is currently open */
  rootPath: string | null;
  /** Tree data structure for react-arborist */
  treeData: FileTreeNode[];
  /** Whether the tree is currently loading */
  isLoading: boolean;
  /** Error message if an operation failed */
  error: string | null;
  /** Currently selected node */
  selectedNode: FileTreeNode | null;
  /** Set of expanded folder paths */
  expandedFolders: Set<string>;
  /** Set of explicitly collapsed folder paths (for persistence) */
  collapsedFolders: Set<string>;
}

/**
 * Actions returned by the useFileTree hook
 */
export interface UseFileTreeActions {
  /** Open a folder using native dialog and load its contents */
  openFolder: () => Promise<string | null>;
  /** Load a specific folder path directly */
  loadFolder: (folderPath: string) => Promise<void>;
  /** Refresh the tree from the current root folder */
  refresh: () => Promise<void>;
  /** Handle folder expand/collapse (loads children lazily) */
  handleToggle: (nodeId: string, isOpen: boolean) => Promise<void>;
  /** Set the currently selected node */
  setSelectedNode: (node: FileTreeNode | null) => void;
  /** Clear the current folder and tree data */
  clearFolder: () => void;
  /** Create a new file in the given parent directory */
  createFile: (parentPath: string, fileName: string) => Promise<void>;
  /** Create a new folder in the given parent directory */
  createFolder: (parentPath: string, folderName: string) => Promise<void>;
  /** Import files from a file dialog into the given directory */
  importFiles: (targetPath: string) => Promise<void>;
  /** Delete a file or folder */
  deleteItem: (path: string) => Promise<void>;
  /** Rename a file or folder */
  renameItem: (oldPath: string, newPath: string) => Promise<void>;
  /** Move a file or folder to a new location */
  moveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  /** Create a new project with default structure in the given folder */
  createProject: () => Promise<string | null>;
  /** Set the collapsed folders (for loading from config) */
  setCollapsedFolders: (folders: Set<string>) => void;
}

/**
 * Return type of the useFileTree hook
 */
export type UseFileTreeReturn = UseFileTreeState & UseFileTreeActions;

/**
 * useFileTree hook
 *
 * Manages file tree state and integrates with Electron IPC for file system operations.
 * Supports lazy loading of directory contents and auto-updates on file system changes.
 *
 * @example
 * ```tsx
 * function FileExplorer() {
 *   const {
 *     rootPath,
 *     treeData,
 *     isLoading,
 *     openFolder,
 *     handleToggle,
 *   } = useFileTree();
 *
 *   return (
 *     <div>
 *       <button onClick={openFolder}>Open Folder</button>
 *       <FileTree
 *         data={treeData}
 *         isLoading={isLoading}
 *         onToggle={handleToggle}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileTree(): UseFileTreeReturn {
  // State
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileTreeNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Refs for cleanup functions and current values
  const fileChangeCleanupRef = useRef<(() => void) | null>(null);
  const watcherErrorCleanupRef = useRef<(() => void) | null>(null);
  const initialLoadDoneRef = useRef(false);
  const rootPathRef = useRef<string | null>(null);

  // Keep rootPathRef in sync with rootPath state
  rootPathRef.current = rootPath;

  /**
   * Load directory contents from a given path
   */
  const loadDirectoryContents = useCallback(async (dirPath: string): Promise<FileTreeNode[]> => {
    const entries: FileSystemEntry[] = await window.electronAPI.readDir(dirPath);
    return transformToTreeData(entries);
  }, []);

  /**
   * Start watching a folder for changes
   */
  const startWatching = useCallback(async (folderPath: string): Promise<void> => {
    // Stop any existing watcher
    await window.electronAPI.stopWatcher();

    // Start new watcher
    await window.electronAPI.startWatcher(folderPath);
  }, []);

  /**
   * Handle file system change events from the watcher
   */
  const handleFileChange = useCallback((eventType: WatchEventType, filePath: string): void => {
    const parentPath = getParentPath(filePath);
    const isDirectory = eventType === 'addDir' || eventType === 'unlinkDir';

    setTreeData((currentTree) => {
      switch (eventType) {
        case 'add':
        case 'addDir': {
          // Create a new node and add it to the tree
          const newNode = createNodeFromPath(filePath, isDirectory);
          // Use ref to get current rootPath value (avoids stale closure issue)
          return addNodeToTree(currentTree, parentPath, newNode, rootPathRef.current ?? undefined);
        }
        case 'unlink':
        case 'unlinkDir': {
          // Remove the node from the tree
          return removeNodeFromTree(currentTree, filePath);
        }
        case 'change': {
          // File content changed - no tree structure update needed
          // Could trigger a refresh of the specific node if needed
          return currentTree;
        }
        default:
          return currentTree;
      }
    });
  }, []); // No dependencies needed - uses ref for current rootPath

  /**
   * Handle watcher errors
   */
  const handleWatcherError = useCallback((errorMessage: string): void => {
    setError(`File watcher error: ${errorMessage}`);
  }, []);

  /**
   * Set up file change listeners
   */
  const setupWatcherListeners = useCallback((): void => {
    // Clean up existing listeners
    if (fileChangeCleanupRef.current) {
      fileChangeCleanupRef.current();
    }
    if (watcherErrorCleanupRef.current) {
      watcherErrorCleanupRef.current();
    }

    // Set up new listeners
    fileChangeCleanupRef.current = window.electronAPI.onFileChange(handleFileChange);
    watcherErrorCleanupRef.current = window.electronAPI.onWatcherError(handleWatcherError);
  }, [handleFileChange, handleWatcherError]);

  /**
   * Load a folder and its contents
   * @param folderPath - The folder path to load
   * @param saveToSettings - Whether to save this folder as the last opened (default: true)
   */
  const loadFolder = useCallback(async (folderPath: string, saveToSettings: boolean = true): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setExpandedFolders(new Set());
    setSelectedNode(null);

    try {
      // Load root directory contents
      let rootContents = await loadDirectoryContents(folderPath);

      // Auto-expand all folders except "Images"
      const foldersToExpand = new Set<string>();
      const foldersToExclude = ['images', 'Images'];

      for (const node of rootContents) {
        if (node.data.isDirectory && !foldersToExclude.includes(node.name)) {
          foldersToExpand.add(node.id);
          // Load children for this folder
          try {
            const children = await loadDirectoryContents(node.id);
            rootContents = updateNodeChildren(rootContents, node.id, children);
          } catch {
            // Ignore errors loading children
          }
        }
      }

      setTreeData(rootContents);
      setRootPath(folderPath);
      setExpandedFolders(foldersToExpand);

      // Save to settings if requested
      if (saveToSettings) {
        await window.electronAPI.setLastFolder(folderPath);
      }

      // Ensure project files exist (prompt library, methods.conf)
      // This runs in background and doesn't block folder loading
      promptLibraryService.ensureProjectFiles(folderPath).catch(err => {
        console.error('Failed to ensure project files:', err);
      });

      // Set up file watcher
      setupWatcherListeners();
      await startWatching(folderPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load folder';
      setError(message);
      setTreeData([]);
      setRootPath(null);
    } finally {
      setIsLoading(false);
    }
  }, [loadDirectoryContents, setupWatcherListeners, startWatching]);

  /**
   * Open a folder using the native dialog
   */
  const openFolder = useCallback(async (): Promise<string | null> => {
    try {
      const selectedPath = await window.electronAPI.openFolder();

      if (selectedPath) {
        await loadFolder(selectedPath);
        return selectedPath;
      }

      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open folder';
      setError(message);
      return null;
    }
  }, [loadFolder]);

  /**
   * Refresh the tree from the current root folder
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!rootPath) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Reload root directory contents
      const rootContents = await loadDirectoryContents(rootPath);

      // For expanded folders, we need to reload their children too
      // This is done recursively for all expanded folders
      const reloadExpanded = async (
        nodes: FileTreeNode[],
        expanded: Set<string>
      ): Promise<FileTreeNode[]> => {
        const result: FileTreeNode[] = [];

        for (const node of nodes) {
          if (node.data.isDirectory && expanded.has(node.id)) {
            try {
              const children = await loadDirectoryContents(node.id);
              const reloadedChildren = await reloadExpanded(children, expanded);
              result.push({ ...node, children: reloadedChildren });
            } catch {
              // If we can't load children, keep the node with empty children
              result.push({ ...node, children: [] });
            }
          } else {
            result.push(node);
          }
        }

        return result;
      };

      const updatedTree = await reloadExpanded(rootContents, expandedFolders);
      setTreeData(updatedTree);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh folder';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [rootPath, expandedFolders, loadDirectoryContents]);

  /**
   * Handle folder toggle (expand/collapse) with lazy loading
   */
  const handleToggle = useCallback(async (nodeId: string, isOpen: boolean): Promise<void> => {
    // Update expanded folders set
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      return next;
    });

    // Update collapsed folders set (for persistence)
    // A folder is collapsed if it was explicitly closed by the user
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        // Expanding - remove from collapsed list
        next.delete(nodeId);
      } else {
        // Collapsing - add to collapsed list
        next.add(nodeId);
      }
      return next;
    });

    // If expanding, load children if not already loaded
    if (isOpen) {
      try {
        const children = await loadDirectoryContents(nodeId);
        setTreeData((currentTree) =>
          updateNodeChildren(currentTree, nodeId, children)
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load folder contents';
        setError(message);
      }
    }
  }, [loadDirectoryContents]);

  /**
   * Clear the current folder and tree data
   */
  const clearFolder = useCallback((): void => {
    setRootPath(null);
    setTreeData([]);
    setSelectedNode(null);
    setExpandedFolders(new Set());
    setCollapsedFolders(new Set());
    setError(null);

    // Stop watcher
    window.electronAPI.stopWatcher().catch(() => {
      // Ignore cleanup errors
    });
  }, []);

  /**
   * Create a new file in the given parent directory
   * For .ink files, also creates a corresponding -settings.json file
   */
  const createFile = useCallback(async (parentPath: string, fileName: string): Promise<void> => {
    try {
      // Normalize the path separator for the platform
      const separator = parentPath.includes('\\') ? '\\' : '/';
      const filePath = `${parentPath}${separator}${fileName}`;

      // Determine initial content based on file type
      let initialContent = '';
      if (fileName.endsWith('.ink')) {
        // Default template for .ink files
        initialContent = `=== start ===\n// Your conversation starts here\n\n-> END\n`;
      } else if (fileName.endsWith('.json')) {
        // Default JSON structure
        initialContent = '{\n  \n}\n';
      }

      // Create the file
      await window.electronAPI.createFile(filePath, initialContent);

      // For .ink files, also create a corresponding -settings.json file
      if (fileName.endsWith('.ink')) {
        const baseName = fileName.replace(/\.ink$/, '');
        const settingsFileName = `${baseName}-settings.json`;
        const settingsFilePath = `${parentPath}${separator}${settingsFileName}`;

        // Check if settings file already exists
        const settingsExists = await window.electronAPI.fileExists(settingsFilePath);
        if (!settingsExists) {
          const settingsContent = JSON.stringify({
            storyId: baseName,
            contactID: '',
            nextStoryId: '',
            isStartingStory: false,
            forceTimeInHours: 12,
            passTimeInMinutes: 0,
            timeIsExact: false,
            forceDay: 0,
            isSideStory: false,
          }, null, 2);
          await window.electronAPI.createFile(settingsFilePath, settingsContent);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create file';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Create a new folder in the given parent directory
   */
  const createFolder = useCallback(async (parentPath: string, folderName: string): Promise<void> => {
    try {
      const separator = parentPath.includes('\\') ? '\\' : '/';
      const folderPath = `${parentPath}${separator}${folderName}`;
      await window.electronAPI.createDir(folderPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Import files from a file dialog into the given directory
   */
  const importFiles = useCallback(async (targetPath: string): Promise<void> => {
    try {
      // Open file selection dialog
      const selectedFiles = await window.electronAPI.openFiles({
        title: 'Import Files',
        multiSelect: true,
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      // Copy each selected file to the target directory
      const separator = targetPath.includes('\\') ? '\\' : '/';

      for (const sourcePath of selectedFiles) {
        // Extract file name from source path
        const sourceNameMatch = sourcePath.match(/[/\\]([^/\\]+)$/);
        const sourceFileName = sourceNameMatch ? sourceNameMatch[1] : sourcePath;
        const destPath = `${targetPath}${separator}${sourceFileName}`;

        await window.electronAPI.copyFile(sourcePath, destPath);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import files';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Delete a file or folder
   */
  const deleteItem = useCallback(async (path: string): Promise<void> => {
    try {
      await window.electronAPI.delete(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete item';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Rename a file or folder
   */
  const renameItem = useCallback(async (oldPath: string, newPath: string): Promise<void> => {
    try {
      await window.electronAPI.rename(oldPath, newPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename item';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Move a file or folder to a new location
   */
  const moveItem = useCallback(async (sourcePath: string, targetFolderPath: string): Promise<void> => {
    try {
      // Extract the file/folder name from the source path
      const separator = sourcePath.includes('\\') ? '\\' : '/';
      const name = sourcePath.split(/[/\\]/).pop();
      if (!name) {
        throw new Error('Invalid source path');
      }

      // Build the new path
      const newPath = `${targetFolderPath}${separator}${name}`;

      // Prevent moving to the same location
      if (sourcePath === newPath) {
        return;
      }

      // Prevent moving a folder into itself or its subdirectories
      const normalizedSource = sourcePath.replace(/\\/g, '/').toLowerCase();
      const normalizedTarget = targetFolderPath.replace(/\\/g, '/').toLowerCase();
      if (normalizedTarget.startsWith(normalizedSource + '/') || normalizedTarget === normalizedSource) {
        throw new Error('Cannot move a folder into itself');
      }

      // Use rename to move the file/folder
      await window.electronAPI.rename(sourcePath, newPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move item';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Create a new project with default structure
   * Opens a folder selection dialog and creates:
   * - mod.json at root
   * - methods.conf at root
   * - Characters/ folder with two default characters
   * - Conversations/ folder with a sample conversation
   * - Images/ folder
   * - Injections/ folder
   */
  const createProject = useCallback(async (): Promise<string | null> => {
    try {
      // Open folder selection dialog
      const selectedPath = await window.electronAPI.openFolder();

      if (!selectedPath) {
        return null;
      }

      const separator = selectedPath.includes('\\') ? '\\' : '/';

      // Create default folders
      const folders = ['Characters', 'Conversations', 'Images', 'Injections'];
      for (const folder of folders) {
        await window.electronAPI.createDir(`${selectedPath}${separator}${folder}`);
      }

      // Create mod.json with default content
      const modJsonPath = `${selectedPath}${separator}mod.json`;
      const modJsonExists = await window.electronAPI.fileExists(modJsonPath);
      if (!modJsonExists) {
        const modJsonContent = JSON.stringify({
          name: selectedPath.split(/[/\\]/).pop() || 'New Project',
          version: '1.0.0',
          description: '',
          author: '',
        }, null, 2);
        await window.electronAPI.createFile(modJsonPath, modJsonContent);
      }

      // Create methods.conf with default content
      const methodsConfPath = `${selectedPath}${separator}methods.conf`;
      const methodsConfExists = await window.electronAPI.fileExists(methodsConfPath);
      if (!methodsConfExists) {
        const methodsConfContent = JSON.stringify({
          availableMethods: [],
        }, null, 2);
        await window.electronAPI.createFile(methodsConfPath, methodsConfContent);
      }

      // Create prompt library with default components
      const promptLibraryPath = `${selectedPath}${separator}${PROMPT_LIBRARY_FILENAME}`;
      const promptLibraryExists = await window.electronAPI.fileExists(promptLibraryPath);
      if (!promptLibraryExists) {
        const promptLibraryContent = JSON.stringify(getDefaultLibrary(), null, 2);
        await window.electronAPI.createFile(promptLibraryPath, promptLibraryContent);
      }

      // Create default characters
      const charactersPath = `${selectedPath}${separator}Characters`;

      // Character 1: Player character (main character)
      const playerJsonPath = `${charactersPath}${separator}player.json`;
      const playerJsonExists = await window.electronAPI.fileExists(playerJsonPath);
      if (!playerJsonExists) {
        const playerJson = JSON.stringify({
          isMainCharacter: true,
          contactID: 'player',
          contactName: 'You',
          contactNickname: 'Player',
          contactNicknameShort: 'You',
          contactLastName: '',
          profilePicturePath: '',
          characterColorHex: '#4a90d9',
          contactDescription: 'This is the player character. Customize this to match your story\'s protagonist.',
          contactPersonality: 'The player\'s personality is shaped by the choices they make throughout the story.',
          contactHistory: 'The player\'s history and background. Add details that are relevant to your story.',
          showContactFromStart: false,
        }, null, 4);
        await window.electronAPI.createFile(playerJsonPath, playerJson);
      }

      const playerConfPath = `${charactersPath}${separator}player.conf`;
      const playerConfExists = await window.electronAPI.fileExists(playerConfPath);
      if (!playerConfExists) {
        const playerConf = JSON.stringify({
          characterId: 'player',
          defaultImagePromptSet: 'default',
          defaultMoodSet: 'neutral',
          imagePromptSets: [
            {
              name: 'default',
              positive: '1person, portrait, casual clothes, neutral expression',
              negative: 'bad quality, blurry, deformed',
            },
          ],
          moodSets: [
            {
              name: 'neutral',
              description: 'Calm and collected, responds thoughtfully to situations.',
            },
          ],
        }, null, 2);
        await window.electronAPI.createFile(playerConfPath, playerConf);
      }

      // Character 2: Sam (example NPC - shown from start)
      const samJsonPath = `${charactersPath}${separator}sam.json`;
      const samJsonExists = await window.electronAPI.fileExists(samJsonPath);
      if (!samJsonExists) {
        const samJson = JSON.stringify({
          isMainCharacter: false,
          contactID: 'sam',
          contactName: 'Samantha',
          contactNickname: 'Sam',
          contactNicknameShort: 'Sam',
          contactLastName: 'Chen',
          profilePicturePath: '',
          characterColorHex: '#e91e63',
          contactDescription: 'Sam is a creative soul with a passion for digital art and game design. She\'s always working on some new project and loves to share her latest creations.',
          contactPersonality: 'Enthusiastic and supportive, with a tendency to get excited about new ideas. She\'s patient when explaining things but can be a bit scatterbrained when she\'s deep in creative mode. Loves puns and making people laugh.',
          contactHistory: 'We met at a game jam last year. She was the only one who didn\'t laugh at my terrible first attempt at pixel art. Since then, she\'s been teaching me the basics and we\'ve become good friends.',
          showContactFromStart: true,
        }, null, 4);
        await window.electronAPI.createFile(samJsonPath, samJson);
      }

      const samConfPath = `${charactersPath}${separator}sam.conf`;
      const samConfExists = await window.electronAPI.fileExists(samConfPath);
      if (!samConfExists) {
        const samConf = JSON.stringify({
          characterId: 'sam',
          defaultImagePromptSet: 'default',
          defaultMoodSet: 'cheerful',
          imagePromptSets: [
            {
              name: 'default',
              positive: '1girl, young woman, asian, black hair, brown eyes, casual artistic outfit, warm smile, creative vibe',
              negative: 'bad quality, blurry, deformed, extra limbs',
            },
          ],
          moodSets: [
            {
              name: 'cheerful',
              description: 'Upbeat and encouraging, uses lots of exclamation marks and emoji-like expressions. Gets excited easily and loves to hype up others\' work.',
            },
            {
              name: 'focused',
              description: 'More serious and concentrated, gives thoughtful feedback. Still friendly but less bubbly, more professional.',
            },
          ],
        }, null, 2);
        await window.electronAPI.createFile(samConfPath, samConf);
      }

      // Create default conversation
      const conversationsPath = `${selectedPath}${separator}Conversations`;

      const helloInkPath = `${conversationsPath}${separator}hello.ink`;
      const helloInkExists = await window.electronAPI.fileExists(helloInkPath);
      if (!helloInkExists) {
        const helloInk = `=== start ===
Hey! I just finished this new piece I've been working on. Want to see it?
+ [Sure, show me!]
    -> show_art
+ [Maybe later, I'm busy]
    -> busy_response

=== show_art ===
*sends image*
It's a pixel art landscape I made for that game jam we talked about. What do you think?
I'm still not sure about the color palette though...
+ [It looks amazing!]
    -> positive_feedback
+ [The colors could use some work]
    -> constructive_feedback

=== busy_response ===
Oh okay, no worries! Just message me when you have time.
I'll be here working on more art anyway haha
-> END

=== positive_feedback ===
Aww thanks!! That means a lot coming from you!
I was really nervous about sharing it but now I feel much better about submitting it.
You're the best! Talk soon!
-> END

=== constructive_feedback ===
Yeah, I had a feeling... The sunset tones aren't quite right, are they?
Maybe I should try warmer oranges instead of these pinkish ones.
Thanks for being honest! I'll work on it and show you the updated version later.
-> END
`;
        await window.electronAPI.createFile(helloInkPath, helloInk);
      }

      const helloSettingsPath = `${conversationsPath}${separator}hello-settings.json`;
      const helloSettingsExists = await window.electronAPI.fileExists(helloSettingsPath);
      if (!helloSettingsExists) {
        const helloSettings = JSON.stringify({
          storyId: 'hello',
          contactID: 'sam',
          nextStoryId: '',
          isStartingStory: true,
          forceTimeInHours: 12,
          passTimeInMinutes: 0,
          timeIsExact: false,
          forceDay: 0,
          isSideStory: false,
        }, null, 2);
        await window.electronAPI.createFile(helloSettingsPath, helloSettings);
      }

      // Load the folder
      await loadFolder(selectedPath);

      return selectedPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      setError(message);
      throw err;
    }
  }, [loadFolder]);

  /**
   * Load last opened folder on mount
   */
  useEffect(() => {
    // Only run once on initial mount
    if (initialLoadDoneRef.current) {
      return;
    }
    initialLoadDoneRef.current = true;

    let isMounted = true;

    async function loadLastFolder() {
      try {
        const lastFolder = await window.electronAPI.getLastFolder();
        if (lastFolder && isMounted) {
          // Load the folder but don't save to settings (it's already saved)
          await loadFolder(lastFolder, false);
        }
      } catch {
        // Ignore errors loading last folder
      }
    }

    loadLastFolder();

    return () => {
      isMounted = false;
    };
  }, [loadFolder]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Clean up event listeners
      if (fileChangeCleanupRef.current) {
        fileChangeCleanupRef.current();
      }
      if (watcherErrorCleanupRef.current) {
        watcherErrorCleanupRef.current();
      }

      // Stop watcher
      window.electronAPI.stopWatcher().catch(() => {
        // Ignore cleanup errors
      });
    };
  }, []);

  return {
    // State
    rootPath,
    treeData,
    isLoading,
    error,
    selectedNode,
    expandedFolders,
    collapsedFolders,
    // Actions
    openFolder,
    loadFolder,
    refresh,
    handleToggle,
    setSelectedNode,
    clearFolder,
    createFile,
    createFolder,
    importFiles,
    deleteItem,
    renameItem,
    moveItem,
    setCollapsedFolders,
    createProject,
  };
}

export default useFileTree;
