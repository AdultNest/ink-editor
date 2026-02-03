/**
 * History module exports
 */

export type {
  HistoryNodeId,
  HistoryOperation,
  HistoryNode,
  ContentDelta,
  DiffOp,
  HistoryTree,
  HistoryNodeViewItem,
} from './historyTypes';

export {
  computeDeltas,
  applyDelta,
  hashContent,
  canApplyDelta,
} from './diffUtils';

export {
  createHistoryTree,
  getContentAtNode,
  pushState,
  undo,
  redo,
  navigateToNode,
  getTreeView,
  canUndo,
  canRedo,
  getRedoBranches,
  getNodeCount,
  getCurrentNode,
  pruneTree,
} from './historyService';
