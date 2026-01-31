/**
 * FileTree component exports
 *
 * Re-exports the FileTree component, custom node renderer, and all related types
 * for convenient importing from a single location.
 */

import FileTree, { type FileTreeProps } from './FileTree';
import FileTreeNode, { type FileTreeNodeProps } from './FileTreeNode';
import {
  type FileTreeNode as FileTreeNodeType,
  type FileTreeNodeData,
  type FileType,
  FILE_TYPE_ICONS,
  getFileExtension,
  getFileType,
  getFileIcon,
  transformToTreeData,
  findNodeById,
  updateNodeChildren,
  addNodeToTree,
  removeNodeFromTree,
  getParentPath,
  getFileName,
  createNodeFromPath,
} from './types';

// Default export is the main FileTree component
export default FileTree;

// Named exports for components
export { FileTree, FileTreeNode };

// Named exports for types
export type {
  FileTreeProps,
  FileTreeNodeProps,
  FileTreeNodeType,
  FileTreeNodeData,
  FileType,
};

// Named exports for constants and utilities
export {
  FILE_TYPE_ICONS,
  getFileExtension,
  getFileType,
  getFileIcon,
  transformToTreeData,
  findNodeById,
  updateNodeChildren,
  addNodeToTree,
  removeNodeFromTree,
  getParentPath,
  getFileName,
  createNodeFromPath,
};
