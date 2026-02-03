/**
 * Custom FileTreeNode renderer for react-arborist
 *
 * Renders file tree nodes with file type icons and visual states
 * for selection, hover, and expanded/collapsed directories.
 */

import type { NodeRendererProps } from 'react-arborist';
import type { FileTreeNode as FileTreeNodeType } from './types';
import { getFileIcon } from './types';

/**
 * Props for the FileTreeNode component
 * Uses the full FileTreeNode type as react-arborist stores tree data in node.data
 */
export interface FileTreeNodeProps extends NodeRendererProps<FileTreeNodeType> {
  /** Callback when right-click context menu is triggered */
  onContextMenu?: (event: React.MouseEvent) => void;
}

/**
 * Custom node renderer for the file tree
 *
 * Displays:
 * - File type icon (emoji-based, determined by file extension or folder state)
 * - File/folder name with truncation on overflow
 * - Visual feedback for selection, hover, and focus states
 * - Drag handle for drag and drop support
 *
 * @param props - NodeRendererProps from react-arborist with optional context menu handler
 */
function FileTreeNode({ node, style, dragHandle, onContextMenu }: FileTreeNodeProps) {
  // Access the tree node data (our FileTreeNode structure)
  const nodeData = node.data;
  const name = nodeData.name;
  const isDirectory = nodeData.data.isDirectory;
  const isOpen = node.isOpen;

  // Get the appropriate icon based on file type and state
  const icon = getFileIcon(name, isDirectory, isOpen);

  // Handle click to toggle folders or select files
  const handleClick = () => {
    if (node.isInternal) {
      node.toggle();
    }
  };

  // Handle double-click to open files (for tab opening)
  const handleDoubleClick = () => {
    if (!node.isInternal) {
      // File double-click is handled by the tree's onActivate callback
      node.activate();
    }
  };

  // Build class names for visual states
  const classNames = ['file-tree-node'];
  if (node.isSelected) {
    classNames.push('file-tree-node--selected');
  }
  if (node.isFocused) {
    classNames.push('file-tree-node--focused');
  }

  // Handle right-click to show context menu
  const handleContextMenu = (event: React.MouseEvent) => {
    if (onContextMenu) {
      onContextMenu(event);
    }
  };

  return (
    <div
      ref={dragHandle}
      className={classNames.join(' ')}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      role="treeitem"
      aria-selected={node.isSelected}
      aria-expanded={node.isInternal ? isOpen : undefined}
      tabIndex={0}
    >
      {/* Expand/collapse arrow for directories */}
      <span className="file-tree-node__arrow">
        {node.isInternal ? (isOpen ? '▼' : '▶') : ''}
      </span>

      {/* File type icon */}
      <span className="file-tree-node__icon" aria-hidden="true">
        {icon}
      </span>

      {/* File/folder name */}
      <span className="file-tree-node__name" title={name}>
        {name}
      </span>
    </div>
  );
}

export default FileTreeNode;
