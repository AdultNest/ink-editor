/**
 * useHistory hook
 *
 * React hook for managing history state with the tree-based undo-redo system.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  HistoryTree,
  HistoryNode,
  HistoryNodeId,
  HistoryOperation,
  HistoryNodeViewItem,
} from '../history';
import {
  createHistoryTree,
  pushState,
  undo as undoTree,
  redo as redoTree,
  navigateToNode,
  getTreeView,
  canUndo as canUndoTree,
  canRedo as canRedoTree,
  getRedoBranches,
  getCurrentNode,
  pruneTree,
} from '../history';

/** Default maximum history length */
export const DEFAULT_MAX_HISTORY_LENGTH = 1000;

export interface UseHistoryOptions {
  /** Maximum number of history entries to keep */
  maxHistoryLength?: number;
}

export interface UseHistoryResult {
  /** The current history tree (null if not initialized) */
  tree: HistoryTree | null;
  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
  /** Available redo branches from current position */
  redoBranches: HistoryNode[];
  /** Flattened tree view for UI display */
  treeView: HistoryNodeViewItem[];
  /** Current node ID */
  currentNodeId: HistoryNodeId | null;

  /** Initialize history with content */
  initialize: (content: string) => void;
  /** Push a new state onto the history */
  push: (content: string, operation: HistoryOperation) => void;
  /** Undo to parent state, returns new content or null if at root */
  undo: () => string | null;
  /** Redo to child state, returns new content or null if no children */
  redo: (branchId?: HistoryNodeId) => string | null;
  /** Jump to any node in the tree, returns new content */
  jumpTo: (nodeId: HistoryNodeId) => string | null;
  /** Reset history (e.g., on file reload) */
  reset: () => void;
  /** Update the max history length */
  setMaxHistoryLength: (length: number) => void;
}

/**
 * Hook for managing history state with tree-based undo-redo.
 */
export function useHistory(options?: UseHistoryOptions): UseHistoryResult {
  const [tree, setTree] = useState<HistoryTree | null>(null);
  const [maxLength, setMaxLength] = useState(options?.maxHistoryLength ?? DEFAULT_MAX_HISTORY_LENGTH);

  // Initialize history with initial content
  const initialize = useCallback((content: string) => {
    setTree(createHistoryTree(content));
  }, []);

  // Reset history
  const reset = useCallback(() => {
    setTree(null);
  }, []);

  // Push new state
  const push = useCallback((content: string, operation: HistoryOperation) => {
    setTree(currentTree => {
      if (!currentTree) return currentTree;
      let newTree = pushState(currentTree, content, operation);
      // Prune if over max length
      if (newTree.nodes.size > maxLength) {
        newTree = pruneTree(newTree, maxLength);
      }
      return newTree;
    });
  }, [maxLength]);

  // Undo
  const undo = useCallback((): string | null => {
    let resultContent: string | null = null;

    setTree(currentTree => {
      if (!currentTree) return currentTree;

      const result = undoTree(currentTree);
      if (result) {
        resultContent = result.content;
        return result.tree;
      }
      return currentTree;
    });

    return resultContent;
  }, []);

  // Redo
  const redo = useCallback((branchId?: HistoryNodeId): string | null => {
    let resultContent: string | null = null;

    setTree(currentTree => {
      if (!currentTree) return currentTree;

      const result = redoTree(currentTree, branchId);
      if (result) {
        resultContent = result.content;
        return result.tree;
      }
      return currentTree;
    });

    return resultContent;
  }, []);

  // Jump to node
  const jumpTo = useCallback((nodeId: HistoryNodeId): string | null => {
    let resultContent: string | null = null;

    setTree(currentTree => {
      if (!currentTree) return currentTree;

      try {
        const result = navigateToNode(currentTree, nodeId);
        resultContent = result.content;
        return result.tree;
      } catch {
        return currentTree;
      }
    });

    return resultContent;
  }, []);

  // Update max history length
  const setMaxHistoryLength = useCallback((length: number) => {
    setMaxLength(length);
    // Prune immediately if current tree exceeds new limit
    setTree(currentTree => {
      if (!currentTree || currentTree.nodes.size <= length) return currentTree;
      return pruneTree(currentTree, length);
    });
  }, []);

  // Derived state
  const canUndo = useMemo(() => tree ? canUndoTree(tree) : false, [tree]);
  const canRedo = useMemo(() => tree ? canRedoTree(tree) : false, [tree]);
  const redoBranches = useMemo(() => tree ? getRedoBranches(tree) : [], [tree]);
  const treeView = useMemo(() => tree ? getTreeView(tree) : [], [tree]);
  const currentNodeId = useMemo(() => tree?.currentId ?? null, [tree]);

  return {
    tree,
    canUndo,
    canRedo,
    redoBranches,
    treeView,
    currentNodeId,
    initialize,
    push,
    undo,
    redo,
    jumpTo,
    reset,
    setMaxHistoryLength,
  };
}

export default useHistory;
