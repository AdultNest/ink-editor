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
  /** Create a new project with default structure in the given folder */
  createProject: () => Promise<string | null>;
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
    setError(null);

    // Stop watcher
    window.electronAPI.stopWatcher().catch(() => {
      // Ignore cleanup errors
    });
  }, []);

  /**
   * Create a new file in the given parent directory
   * For .ink files, also creates a corresponding .json file
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

      // For .ink files, also create a corresponding .json file
      if (fileName.endsWith('.ink')) {
        const jsonFileName = fileName.replace(/\.ink$/, '.json');
        const jsonFilePath = `${parentPath}${separator}${jsonFileName}`;

        // Check if JSON file already exists
        const jsonExists = await window.electronAPI.fileExists(jsonFilePath);
        if (!jsonExists) {
          const jsonContent = JSON.stringify({
            name: fileName.replace(/\.ink$/, ''),
            description: '',
            variables: {},
          }, null, 2);
          await window.electronAPI.createFile(jsonFilePath, jsonContent);
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
   * Create a new project with default structure
   * Opens a folder selection dialog and creates:
   * - mod.json at root
   * - Characters/ folder
   * - Conversations/ folder
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
    createProject,
  };
}

export default useFileTree;
