/**
 * FileTree types and data transformation utilities
 *
 * Provides TypeScript interfaces for react-arborist tree structure
 * and utility functions for converting file system data to tree format.
 */

import type { FileSystemEntry } from '../../types/electron.d.ts';

/**
 * Data associated with each file tree node
 */
export interface FileTreeNodeData {
  /** Full absolute path to the file or directory */
  path: string;
  /** Whether this entry is a directory */
  isDirectory: boolean;
  /** File extension (empty string for directories) */
  extension: string;
}

/**
 * Tree node structure compatible with react-arborist
 * @see https://github.com/brimdata/react-arborist
 */
export interface FileTreeNode {
  /** Unique identifier - uses the full file path */
  id: string;
  /** Display name (file or folder name) */
  name: string;
  /** Child nodes for directories (undefined for files) */
  children?: FileTreeNode[];
  /** Additional node data */
  data: FileTreeNodeData;
}

/**
 * File type categories for icon mapping
 */
export type FileType =
  | 'folder'
  | 'folder-open'
  | 'javascript'
  | 'typescript'
  | 'react'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'image'
  | 'video'
  | 'audio'
  | 'config'
  | 'git'
  | 'ink'
  | 'default';

/**
 * Icon mapping for file types (using emoji for simplicity)
 * Can be replaced with @react-symbols/icons or custom SVGs
 */
export const FILE_TYPE_ICONS: Record<FileType, string> = {
  'folder': '📁',
  'folder-open': '📂',
  'javascript': '🟨',
  'typescript': '🔷',
  'react': '⚛️',
  'json': '📋',
  'markdown': '📝',
  'html': '🌐',
  'css': '🎨',
  'image': '🖼️',
  'video': '🎬',
  'audio': '🎵',
  'config': '⚙️',
  'git': '🔀',
  'ink': '🖋️',
  'default': '📄',
};

/**
 * Extension to file type mapping
 */
const EXTENSION_TO_TYPE: Record<string, FileType> = {
  // JavaScript
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // TypeScript
  '.ts': 'typescript',
  '.d.ts': 'typescript',
  // React
  '.jsx': 'react',
  '.tsx': 'react',
  // Data formats
  '.json': 'json',
  '.jsonc': 'json',
  // Markup
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  // Styles
  '.css': 'css',
  '.scss': 'css',
  '.sass': 'css',
  '.less': 'css',
  // Images
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.webp': 'image',
  '.ico': 'image',
  // Config files
  '.yml': 'config',
  '.yaml': 'config',
  '.toml': 'config',
  '.ini': 'config',
  '.env': 'config',
  // Ink files
  '.ink': 'ink',
  // Video files
  '.mp4': 'video',
  '.webm': 'video',
  '.ogg': 'video',
  '.ogv': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.m4v': 'video',
  // Audio files
  '.mp3': 'audio',
  '.wav': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.oga': 'audio',
  '.m4a': 'audio',
};

/**
 * File names that have special type handling
 */
const SPECIAL_FILE_NAMES: Record<string, FileType> = {
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  'package.json': 'json',
  'tsconfig.json': 'config',
  'vite.config.ts': 'config',
  'vite.config.js': 'config',
  '.eslintrc': 'config',
  '.eslintrc.js': 'config',
  '.eslintrc.json': 'config',
  '.prettierrc': 'config',
  '.prettierrc.js': 'config',
  '.prettierrc.json': 'config',
};

/**
 * Extracts the file extension from a file name
 * @param fileName - The name of the file
 * @returns The file extension including the dot, or empty string for directories
 */
export function getFileExtension(fileName: string): string {
  // Handle files without extension
  if (!fileName.includes('.')) {
    return '';
  }

  // Handle hidden files (like .gitignore)
  if (fileName.startsWith('.') && fileName.lastIndexOf('.') === 0) {
    return '';
  }

  // Handle .d.ts files specially
  if (fileName.endsWith('.d.ts')) {
    return '.d.ts';
  }

  const lastDotIndex = fileName.lastIndexOf('.');
  return fileName.slice(lastDotIndex).toLowerCase();
}

/**
 * Determines the file type based on file name and extension
 * @param fileName - The name of the file
 * @param isDirectory - Whether the entry is a directory
 * @param isOpen - Whether the directory is expanded (for folder icons)
 * @returns The file type for icon mapping
 */
export function getFileType(
  fileName: string,
  isDirectory: boolean,
  isOpen: boolean = false
): FileType {
  if (isDirectory) {
    return isOpen ? 'folder-open' : 'folder';
  }

  // Check special file names first
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName in SPECIAL_FILE_NAMES) {
    return SPECIAL_FILE_NAMES[lowerFileName];
  }

  // Check by extension
  const extension = getFileExtension(fileName);
  if (extension in EXTENSION_TO_TYPE) {
    return EXTENSION_TO_TYPE[extension];
  }

  return 'default';
}

/**
 * Gets the icon for a file based on its name and type
 * @param fileName - The name of the file
 * @param isDirectory - Whether the entry is a directory
 * @param isOpen - Whether the directory is expanded
 * @returns The icon string (emoji or symbol)
 */
export function getFileIcon(
  fileName: string,
  isDirectory: boolean,
  isOpen: boolean = false
): string {
  const fileType = getFileType(fileName, isDirectory, isOpen);
  return FILE_TYPE_ICONS[fileType];
}

/**
 * Transforms a flat array of FileSystemEntry objects into a tree node structure
 * compatible with react-arborist
 *
 * @param entries - Array of file system entries from readDir
 * @returns Array of tree nodes with directories containing empty children arrays
 */
export function transformToTreeData(entries: FileSystemEntry[]): FileTreeNode[] {
  return entries
    .map((entry): FileTreeNode => ({
      id: entry.path,
      name: entry.name,
      // Directories get an empty children array to indicate they can be expanded
      // The actual children are loaded lazily when the user expands the folder
      children: entry.isDirectory ? [] : undefined,
      data: {
        path: entry.path,
        isDirectory: entry.isDirectory,
        extension: entry.isDirectory ? '' : getFileExtension(entry.name),
      },
    }))
    // Sort: directories first, then alphabetically by name (case-insensitive)
    .sort((a, b) => {
      // Directories come first
      if (a.data.isDirectory && !b.data.isDirectory) return -1;
      if (!a.data.isDirectory && b.data.isDirectory) return 1;
      // Then sort alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}

/**
 * Recursively finds a node in the tree by its ID (path)
 * @param nodes - Array of tree nodes to search
 * @param id - The node ID to find
 * @returns The found node or undefined
 */
export function findNodeById(
  nodes: FileTreeNode[],
  id: string
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Updates a node's children in the tree (immutably)
 * @param nodes - The current tree nodes
 * @param parentId - The ID of the parent node to update
 * @param newChildren - The new children to set
 * @returns A new tree with the updated node
 */
export function updateNodeChildren(
  nodes: FileTreeNode[],
  parentId: string,
  newChildren: FileTreeNode[]
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: newChildren };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeChildren(node.children, parentId, newChildren),
      };
    }
    return node;
  });
}

/**
 * Adds a new node to the tree at the correct parent location
 * @param nodes - The current tree nodes
 * @param parentPath - The parent directory path
 * @param newNode - The new node to add
 * @param rootPath - Optional root path of the tree (for detecting root-level additions)
 * @returns A new tree with the added node
 */
export function addNodeToTree(
  nodes: FileTreeNode[],
  parentPath: string,
  newNode: FileTreeNode,
  rootPath?: string
): FileTreeNode[] {
  // If adding to root (either empty parentPath or parentPath matches rootPath)
  if (parentPath === '' || (rootPath && parentPath === rootPath)) {
    // Check if node already exists to avoid duplicates
    if (nodes.some(n => n.id === newNode.id)) {
      return nodes;
    }
    const newNodes = [...nodes, newNode];
    return sortNodes(newNodes);
  }

  return nodes.map((node) => {
    if (node.id === parentPath && node.children) {
      // Check if node already exists to avoid duplicates
      if (node.children.some(n => n.id === newNode.id)) {
        return node;
      }
      const newChildren = sortNodes([...node.children, newNode]);
      return { ...node, children: newChildren };
    }
    if (node.children) {
      return {
        ...node,
        children: addNodeToTree(node.children, parentPath, newNode, rootPath),
      };
    }
    return node;
  });
}

/**
 * Removes a node from the tree by its ID
 * @param nodes - The current tree nodes
 * @param nodeId - The ID of the node to remove
 * @returns A new tree with the node removed
 */
export function removeNodeFromTree(
  nodes: FileTreeNode[],
  nodeId: string
): FileTreeNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.children) {
        return {
          ...node,
          children: removeNodeFromTree(node.children, nodeId),
        };
      }
      return node;
    });
}

/**
 * Sorts nodes: directories first, then alphabetically by name
 * @param nodes - Array of nodes to sort
 * @returns Sorted array of nodes
 */
function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.data.isDirectory && !b.data.isDirectory) return -1;
    if (!a.data.isDirectory && b.data.isDirectory) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * Gets the parent path from a file path
 * Handles both forward slashes (Unix) and backslashes (Windows)
 * @param filePath - The full file path
 * @returns The parent directory path with original separators preserved
 */
export function getParentPath(filePath: string): string {
  // Find the last path separator (either / or \)
  const forwardSlashIndex = filePath.lastIndexOf('/');
  const backslashIndex = filePath.lastIndexOf('\\');
  const lastSlashIndex = Math.max(forwardSlashIndex, backslashIndex);

  if (lastSlashIndex === -1) {
    return '';
  }
  return filePath.slice(0, lastSlashIndex);
}

/**
 * Gets the file name from a full path
 * Handles both forward slashes (Unix) and backslashes (Windows)
 * @param filePath - The full file path
 * @returns The file name
 */
export function getFileName(filePath: string): string {
  // Find the last path separator (either / or \)
  const forwardSlashIndex = filePath.lastIndexOf('/');
  const backslashIndex = filePath.lastIndexOf('\\');
  const lastSlashIndex = Math.max(forwardSlashIndex, backslashIndex);

  if (lastSlashIndex === -1) {
    return filePath;
  }
  return filePath.slice(lastSlashIndex + 1);
}

/**
 * Creates a new FileTreeNode from a path
 * @param filePath - The full file path
 * @param isDirectory - Whether this is a directory
 * @returns A new FileTreeNode
 */
export function createNodeFromPath(
  filePath: string,
  isDirectory: boolean
): FileTreeNode {
  const name = getFileName(filePath);
  return {
    id: filePath,
    name,
    children: isDirectory ? [] : undefined,
    data: {
      path: filePath,
      isDirectory,
      extension: isDirectory ? '' : getFileExtension(name),
    },
  };
}
