/**
 * History Types
 *
 * Type definitions for the tree-based undo-redo system.
 */

export type HistoryNodeId = string;

export interface HistoryOperation {
  /** Human-readable description of the operation */
  description: string;
  /** Type of operation performed */
  type: 'edit' | 'add' | 'delete' | 'move' | 'rename' | 'layout';
  /** Target knot/region name if applicable */
  target?: string;
}

export interface HistoryNode {
  /** Unique identifier for this node */
  id: HistoryNodeId;
  /** Parent node ID, null for root */
  parentId: HistoryNodeId | null;
  /** Child node IDs - multiple children = branches */
  childIds: HistoryNodeId[];
  /** Timestamp when this state was created */
  timestamp: number;
  /** Operation that created this state */
  operation: HistoryOperation;
  /** Delta to apply to parent content to get this content */
  forwardDelta: ContentDelta | null;
  /** Delta to apply to this content to get parent content */
  backwardDelta: ContentDelta | null;
  /** Full content snapshot (stored every N nodes for performance) */
  snapshot?: string;
  /** User-defined label for this branch */
  branchLabel?: string;
}

export interface ContentDelta {
  /** Array of diff operations */
  ops: DiffOp[];
  /** Hash of content before applying delta */
  beforeHash: string;
  /** Hash of content after applying delta */
  afterHash: string;
}

export type DiffOp =
  | { type: 'retain'; count: number }
  | { type: 'insert'; text: string }
  | { type: 'delete'; count: number };

export interface HistoryTree {
  /** Map of all nodes by ID */
  nodes: Map<HistoryNodeId, HistoryNode>;
  /** ID of the root node (initial state) */
  rootId: HistoryNodeId;
  /** ID of the current node (current state) */
  currentId: HistoryNodeId;
}

export interface HistoryNodeViewItem {
  /** The history node */
  node: HistoryNode;
  /** Depth in the tree (0 = root) */
  depth: number;
  /** Whether this node is on the path from root to current */
  isOnCurrentPath: boolean;
  /** Whether this is the current node */
  isCurrent: boolean;
  /** Whether this node has siblings (is part of a branch) */
  hasSiblings: boolean;
  /** Index among siblings (0-based) */
  siblingIndex: number;
  /** Total number of siblings including this node */
  siblingCount: number;
  /** Whether this is the last child of its parent */
  isLastChild: boolean;
}
