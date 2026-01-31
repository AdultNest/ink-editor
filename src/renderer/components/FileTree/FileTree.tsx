/**
 * FileTree component using react-arborist
 *
 * Displays a virtualized tree view of the file system with:
 * - Custom node rendering with file type icons
 * - Lazy loading of directory contents
 * - Selection and activation callbacks
 * - Context menu for file/folder operations
 * - Empty state handling
 */

import { Tree, TreeApi, NodeApi } from 'react-arborist';
import { useRef, useCallback, useState } from 'react';
import FileTreeNode from './FileTreeNode';
import type { FileTreeNode as FileTreeNodeType } from './types';
import './FileTree.css';

/**
 * Context menu state
 */
interface ContextMenuState {
  x: number;
  y: number;
  /** The target folder path (or root folder if right-clicked on empty space) */
  targetPath: string;
  /** Whether the target is a directory */
  isDirectory: boolean;
  /** Whether delete option should be shown */
  canDelete: boolean;
  /** The path to delete (when right-clicking on a node) */
  deletePath?: string;
}

/**
 * Input mode for creating new files/folders
 */
interface InputState {
  /** The parent directory path */
  parentPath: string;
  /** Whether creating a file or folder */
  type: 'file' | 'folder';
  /** Current input value */
  value: string;
}

/**
 * Props for the FileTree component
 */
export interface FileTreeProps {
  /** Tree data to display */
  data: FileTreeNodeType[];
  /** Root folder path (for context menu on empty areas) */
  rootPath?: string;
  /** Callback when a node is selected (single click) */
  onSelect?: (node: FileTreeNodeType | null) => void;
  /** Callback when a node is activated (double click on file) */
  onActivate?: (node: FileTreeNodeType) => void;
  /** Callback when a folder is toggled open/closed */
  onToggle?: (nodeId: string, isOpen: boolean) => void;
  /** Callback when a new file is created */
  onCreateFile?: (parentPath: string, fileName: string) => Promise<void>;
  /** Callback when a new folder is created */
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<void>;
  /** Callback when files are imported */
  onImportFiles?: (targetPath: string) => Promise<void>;
  /** Callback when a file/folder is deleted */
  onDelete?: (path: string) => void | Promise<void>;
  /** Callback to show file/folder in system file explorer */
  onShowInExplorer?: (path: string) => void | Promise<void>;
  /** Width of the tree (for virtualization) */
  width?: number;
  /** Height of the tree (for virtualization) */
  height?: number;
  /** Row height for each tree node */
  rowHeight?: number;
  /** Indent size for each nesting level */
  indent?: number;
  /** Whether the tree is loading initial data */
  isLoading?: boolean;
  /** Message to show when the tree is empty */
  emptyMessage?: string;
}

/**
 * FileTree component
 *
 * Renders a virtualized file tree using react-arborist.
 * Supports lazy loading of directory contents and file type icons.
 */
function FileTree({
  data,
  rootPath,
  onSelect,
  onActivate,
  onToggle,
  onCreateFile,
  onCreateFolder,
  onImportFiles,
  onDelete,
  onShowInExplorer,
  width = 300,
  height = 600,
  rowHeight = 26,
  indent = 16,
  isLoading = false,
  emptyMessage = 'No files to display',
}: FileTreeProps) {
  // Ref to access the tree API for programmatic control
  const treeRef = useRef<TreeApi<FileTreeNodeType> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Input field state for creating new files/folders
  const [inputState, setInputState] = useState<InputState | null>(null);

  /**
   * Handle node selection (single click)
   * react-arborist provides NodeApi wrappers, we extract the underlying data
   */
  const handleSelect = useCallback(
    (nodes: NodeApi<FileTreeNodeType>[]) => {
      if (onSelect) {
        onSelect(nodes.length > 0 ? nodes[0].data : null);
      }
    },
    [onSelect]
  );

  /**
   * Handle node activation (double click on files)
   * react-arborist provides NodeApi wrapper, we extract the underlying data
   */
  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNodeType>) => {
      if (onActivate && node.data) {
        onActivate(node.data);
      }
    },
    [onActivate]
  );

  /**
   * Handle folder toggle (expand/collapse)
   */
  const handleToggle = useCallback(
    (nodeId: string) => {
      if (onToggle && treeRef.current) {
        const node = treeRef.current.get(nodeId);
        if (node) {
          // At this point, node.isOpen already reflects the new state after toggle
          onToggle(nodeId, node.isOpen);
        }
      }
    },
    [onToggle]
  );

  /**
   * Handle right-click context menu on tree container
   */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();

      // Check if clicked on a node
      const target = event.target as HTMLElement;
      const nodeElement = target.closest('.file-tree-node');

      if (nodeElement) {
        // Get the node data from the element - look for aria-rowindex or traverse tree
        const nodeIndex = nodeElement.getAttribute('data-index');
        if (nodeIndex && treeRef.current) {
          // react-arborist doesn't provide easy access by index, use selection instead
        }
      }

      // Default: context menu for root folder
      if (rootPath) {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          targetPath: rootPath,
          isDirectory: true,
          canDelete: false,
        });
      }
    },
    [rootPath]
  );

  /**
   * Handle context menu on a specific node
   */
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FileTreeNodeType) => {
      event.preventDefault();
      event.stopPropagation();

      const isDir = node.data.isDirectory;
      const targetPath = isDir ? node.data.path : getParentPath(node.data.path);

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        targetPath,
        isDirectory: isDir,
        canDelete: true, // Can delete specific nodes
        deletePath: node.data.path, // The actual path to delete
      });
    },
    []
  );

  /**
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Handle New File action
   */
  const handleNewFile = useCallback(() => {
    if (contextMenu) {
      setInputState({
        parentPath: contextMenu.targetPath,
        type: 'file',
        value: '',
      });
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  /**
   * Handle New Folder action
   */
  const handleNewFolder = useCallback(() => {
    if (contextMenu) {
      setInputState({
        parentPath: contextMenu.targetPath,
        type: 'folder',
        value: '',
      });
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  /**
   * Handle Import Files action
   */
  const handleImportFiles = useCallback(async () => {
    if (contextMenu && onImportFiles) {
      await onImportFiles(contextMenu.targetPath);
    }
    closeContextMenu();
  }, [contextMenu, onImportFiles, closeContextMenu]);

  /**
   * Handle Delete action
   */
  const handleDelete = useCallback(async () => {
    if (contextMenu?.canDelete && contextMenu.deletePath && onDelete) {
      await onDelete(contextMenu.deletePath);
    }
    closeContextMenu();
  }, [contextMenu, onDelete, closeContextMenu]);

  /**
   * Handle Show in Explorer action
   */
  const handleShowInExplorer = useCallback(async () => {
    if (contextMenu && onShowInExplorer) {
      // Show the specific item if right-clicked on a node, otherwise show root
      const pathToShow = contextMenu.deletePath || contextMenu.targetPath;
      await onShowInExplorer(pathToShow);
    }
    closeContextMenu();
  }, [contextMenu, onShowInExplorer, closeContextMenu]);

  /**
   * Handle input submission for new file/folder
   */
  const handleInputSubmit = useCallback(async () => {
    if (!inputState || !inputState.value.trim()) {
      setInputState(null);
      return;
    }

    const name = inputState.value.trim();

    if (inputState.type === 'file' && onCreateFile) {
      await onCreateFile(inputState.parentPath, name);
    } else if (inputState.type === 'folder' && onCreateFolder) {
      await onCreateFolder(inputState.parentPath, name);
    }

    setInputState(null);
  }, [inputState, onCreateFile, onCreateFolder]);

  /**
   * Handle input key events
   */
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleInputSubmit();
      } else if (event.key === 'Escape') {
        setInputState(null);
      }
    },
    [handleInputSubmit]
  );

  /**
   * Handle click outside to close context menu
   */
  const handleContainerClick = useCallback(() => {
    if (contextMenu) {
      closeContextMenu();
    }
  }, [contextMenu, closeContextMenu]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="file-tree file-tree--loading">
        <div className="file-tree__loading-spinner" aria-label="Loading...">
          <span className="file-tree__loading-icon">⏳</span>
          <span className="file-tree__loading-text">Loading...</span>
        </div>
      </div>
    );
  }

  // Show empty state when no data
  if (data.length === 0) {
    return (
      <div
        className="file-tree file-tree--empty"
        onContextMenu={handleContextMenu}
      >
        <p className="file-tree__empty-message">{emptyMessage}</p>

        {/* Context menu */}
        {contextMenu && (
          <>
            <div
              className="file-tree-context-menu-overlay"
              onClick={closeContextMenu}
            />
            <div
              className="file-tree-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                className="file-tree-context-menu__item"
                onClick={handleNewFile}
              >
                📄 New File
              </button>
              <button
                className="file-tree-context-menu__item"
                onClick={handleNewFolder}
              >
                📁 New Folder
              </button>
              <button
                className="file-tree-context-menu__item"
                onClick={handleImportFiles}
              >
                📥 Import Files
              </button>
              <div className="file-tree-context-menu__divider" />
              <button
                className="file-tree-context-menu__item"
                onClick={handleShowInExplorer}
              >
                📂 Show in Explorer
              </button>
            </div>
          </>
        )}

        {/* Input dialog */}
        {inputState && (
          <div className="file-tree-input-dialog">
            <div className="file-tree-input-dialog__content">
              <label className="file-tree-input-dialog__label">
                {inputState.type === 'file' ? 'New File Name:' : 'New Folder Name:'}
              </label>
              <input
                type="text"
                className="file-tree-input-dialog__input"
                value={inputState.value}
                onChange={(e) =>
                  setInputState({ ...inputState, value: e.target.value })
                }
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputSubmit}
                placeholder={inputState.type === 'file' ? 'filename.ink' : 'folder-name'}
                autoFocus
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="file-tree"
      ref={containerRef}
      role="tree"
      aria-label="File tree"
      onContextMenu={handleContextMenu}
      onClick={handleContainerClick}
    >
      <Tree<FileTreeNodeType>
        ref={treeRef}
        data={data}
        width={width}
        height={height}
        rowHeight={rowHeight}
        indent={indent}
        onSelect={handleSelect}
        onActivate={handleActivate}
        onToggle={handleToggle}
        openByDefault={false}
        disableDrag
        disableDrop
      >
        {(props) => (
          <FileTreeNode
            {...props}
            onContextMenu={(e) => handleNodeContextMenu(e, props.node.data)}
          />
        )}
      </Tree>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="file-tree-context-menu-overlay"
            onClick={closeContextMenu}
          />
          <div
            className="file-tree-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="file-tree-context-menu__item"
              onClick={handleNewFile}
            >
              📄 New File
            </button>
            <button
              className="file-tree-context-menu__item"
              onClick={handleNewFolder}
            >
              📁 New Folder
            </button>
            <button
              className="file-tree-context-menu__item"
              onClick={handleImportFiles}
            >
              📥 Import Files
            </button>
            <div className="file-tree-context-menu__divider" />
            <button
              className="file-tree-context-menu__item"
              onClick={handleShowInExplorer}
            >
              📂 Show in Explorer
            </button>
            {contextMenu.canDelete && (
              <>
                <div className="file-tree-context-menu__divider" />
                <button
                  className="file-tree-context-menu__item file-tree-context-menu__item--danger"
                  onClick={handleDelete}
                >
                  🗑️ Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Input dialog */}
      {inputState && (
        <div className="file-tree-input-dialog">
          <div className="file-tree-input-dialog__content">
            <label className="file-tree-input-dialog__label">
              {inputState.type === 'file' ? 'New File Name:' : 'New Folder Name:'}
            </label>
            <input
              type="text"
              className="file-tree-input-dialog__input"
              value={inputState.value}
              onChange={(e) =>
                setInputState({ ...inputState, value: e.target.value })
              }
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputSubmit}
              placeholder={inputState.type === 'file' ? 'filename.ink' : 'folder-name'}
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Gets the parent path from a file path
 */
function getParentPath(filePath: string): string {
  const forwardSlashIndex = filePath.lastIndexOf('/');
  const backslashIndex = filePath.lastIndexOf('\\');
  const lastSlashIndex = Math.max(forwardSlashIndex, backslashIndex);

  if (lastSlashIndex === -1) {
    return '';
  }
  return filePath.slice(0, lastSlashIndex);
}

export default FileTree;
