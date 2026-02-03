/**
 * History Service
 *
 * Core tree operations for the undo-redo system.
 * Manages creating, navigating, and querying the history tree.
 */

import type {
  HistoryTree,
  HistoryNode,
  HistoryNodeId,
  HistoryOperation,
  HistoryNodeViewItem,
} from './historyTypes';
import { computeDeltas, applyDelta, hashContent } from './diffUtils';

/** How often to store full snapshots (every N nodes) */
const SNAPSHOT_INTERVAL = 10;

/** Generate a unique ID for a history node */
function generateId(): HistoryNodeId {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a new history tree with the given initial content.
 */
export function createHistoryTree(initialContent: string): HistoryTree {
  const rootId = generateId();
  const rootNode: HistoryNode = {
    id: rootId,
    parentId: null,
    childIds: [],
    timestamp: Date.now(),
    operation: { description: 'Initial state', type: 'edit' },
    forwardDelta: null,
    backwardDelta: null,
    snapshot: initialContent,
  };

  return {
    nodes: new Map([[rootId, rootNode]]),
    rootId,
    currentId: rootId,
  };
}

/**
 * Get the content at a specific node by traversing from nearest snapshot.
 */
export function getContentAtNode(tree: HistoryTree, nodeId: HistoryNodeId): string {
  const node = tree.nodes.get(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  // If this node has a snapshot, return it directly
  if (node.snapshot !== undefined) {
    return node.snapshot;
  }

  // Find the nearest ancestor with a snapshot
  const pathToSnapshot: HistoryNode[] = [];
  let current: HistoryNode | undefined = node;

  while (current && current.snapshot === undefined) {
    pathToSnapshot.push(current);
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }

  if (!current || current.snapshot === undefined) {
    throw new Error('No snapshot found in history');
  }

  // Apply forward deltas from snapshot to target node
  let content = current.snapshot;
  for (let i = pathToSnapshot.length - 1; i >= 0; i--) {
    const pathNode = pathToSnapshot[i];
    if (pathNode.forwardDelta) {
      content = applyDelta(content, pathNode.forwardDelta);
    }
  }

  return content;
}

/**
 * Calculate the depth of a node from the root.
 */
function getNodeDepth(tree: HistoryTree, nodeId: HistoryNodeId): number {
  let depth = 0;
  let current = tree.nodes.get(nodeId);
  while (current && current.parentId) {
    depth++;
    current = tree.nodes.get(current.parentId);
  }
  return depth;
}

/**
 * Push a new state onto the history tree.
 * If not at a leaf, this creates a new branch.
 */
export function pushState(
  tree: HistoryTree,
  newContent: string,
  operation: HistoryOperation
): HistoryTree {
  const currentNode = tree.nodes.get(tree.currentId);
  if (!currentNode) {
    throw new Error('Current node not found');
  }

  // Get the current content to compute deltas
  const currentContent = getContentAtNode(tree, tree.currentId);

  // Don't create new node if content hasn't changed
  if (currentContent === newContent) {
    return tree;
  }

  // Compute deltas
  const { forward, backward } = computeDeltas(currentContent, newContent);

  // Create new node
  const newId = generateId();
  const depth = getNodeDepth(tree, tree.currentId) + 1;

  const newNode: HistoryNode = {
    id: newId,
    parentId: tree.currentId,
    childIds: [],
    timestamp: Date.now(),
    operation,
    forwardDelta: forward,
    backwardDelta: backward,
    // Store snapshot every SNAPSHOT_INTERVAL nodes
    snapshot: depth % SNAPSHOT_INTERVAL === 0 ? newContent : undefined,
  };

  // Update the tree
  const newNodes = new Map(tree.nodes);

  // Add new node
  newNodes.set(newId, newNode);

  // Update current node to add child
  const updatedCurrentNode: HistoryNode = {
    ...currentNode,
    childIds: [...currentNode.childIds, newId],
  };
  newNodes.set(tree.currentId, updatedCurrentNode);

  return {
    nodes: newNodes,
    rootId: tree.rootId,
    currentId: newId,
  };
}

/**
 * Move to parent node (undo).
 * Returns null if already at root.
 */
export function undo(tree: HistoryTree): { tree: HistoryTree; content: string } | null {
  const currentNode = tree.nodes.get(tree.currentId);
  if (!currentNode || !currentNode.parentId) {
    return null;
  }

  const parentContent = getContentAtNode(tree, currentNode.parentId);

  return {
    tree: {
      ...tree,
      currentId: currentNode.parentId,
    },
    content: parentContent,
  };
}

/**
 * Move to child node (redo).
 * If multiple children exist (branches), picks the most recent or specified one.
 * Returns null if no children.
 */
export function redo(
  tree: HistoryTree,
  childId?: HistoryNodeId
): { tree: HistoryTree; content: string } | null {
  const currentNode = tree.nodes.get(tree.currentId);
  if (!currentNode || currentNode.childIds.length === 0) {
    return null;
  }

  let targetId: HistoryNodeId;

  if (childId && currentNode.childIds.includes(childId)) {
    targetId = childId;
  } else {
    // Pick the most recent child (last in the array, which is the most recently added)
    targetId = currentNode.childIds[currentNode.childIds.length - 1];
  }

  const childContent = getContentAtNode(tree, targetId);

  return {
    tree: {
      ...tree,
      currentId: targetId,
    },
    content: childContent,
  };
}

/**
 * Navigate to any node in the tree.
 */
export function navigateToNode(
  tree: HistoryTree,
  targetId: HistoryNodeId
): { tree: HistoryTree; content: string } {
  if (!tree.nodes.has(targetId)) {
    throw new Error(`Node ${targetId} not found`);
  }

  const content = getContentAtNode(tree, targetId);

  return {
    tree: {
      ...tree,
      currentId: targetId,
    },
    content,
  };
}

/**
 * Get the path from root to a specific node.
 */
function getPathToNode(tree: HistoryTree, nodeId: HistoryNodeId): HistoryNodeId[] {
  const path: HistoryNodeId[] = [];
  let current = tree.nodes.get(nodeId);

  while (current) {
    path.unshift(current.id);
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }

  return path;
}

/**
 * Get a flattened tree view for UI display.
 * Returns nodes in DFS order with depth and path information.
 */
export function getTreeView(tree: HistoryTree): HistoryNodeViewItem[] {
  const items: HistoryNodeViewItem[] = [];
  const currentPath = new Set(getPathToNode(tree, tree.currentId));

  function traverse(nodeId: HistoryNodeId, depth: number, siblingIndex: number, siblingCount: number, isLastChild: boolean): void {
    const node = tree.nodes.get(nodeId);
    if (!node) return;

    items.push({
      node,
      depth,
      isOnCurrentPath: currentPath.has(nodeId),
      isCurrent: nodeId === tree.currentId,
      hasSiblings: siblingCount > 1,
      siblingIndex,
      siblingCount,
      isLastChild,
    });

    // Traverse children
    const children = node.childIds;
    children.forEach((childId, index) => {
      traverse(childId, depth + 1, index, children.length, index === children.length - 1);
    });
  }

  traverse(tree.rootId, 0, 0, 1, true);

  return items;
}

/**
 * Check if undo is possible.
 */
export function canUndo(tree: HistoryTree): boolean {
  const currentNode = tree.nodes.get(tree.currentId);
  return !!currentNode && !!currentNode.parentId;
}

/**
 * Check if redo is possible.
 */
export function canRedo(tree: HistoryTree): boolean {
  const currentNode = tree.nodes.get(tree.currentId);
  return !!currentNode && currentNode.childIds.length > 0;
}

/**
 * Get available redo branches from current position.
 */
export function getRedoBranches(tree: HistoryTree): HistoryNode[] {
  const currentNode = tree.nodes.get(tree.currentId);
  if (!currentNode) return [];

  return currentNode.childIds
    .map(id => tree.nodes.get(id))
    .filter((node): node is HistoryNode => node !== undefined);
}

/**
 * Get the total number of nodes in the tree.
 */
export function getNodeCount(tree: HistoryTree): number {
  return tree.nodes.size;
}

/**
 * Get the current node.
 */
export function getCurrentNode(tree: HistoryTree): HistoryNode | undefined {
  return tree.nodes.get(tree.currentId);
}

/**
 * Prune the history tree to stay within the maximum size.
 * Removes old nodes that are not on the path to the current state.
 * Prioritizes removing old branches that don't lead to current.
 */
export function pruneTree(tree: HistoryTree, maxNodes: number): HistoryTree {
  if (tree.nodes.size <= maxNodes) {
    return tree;
  }

  // Get the path from root to current (these nodes must be preserved)
  const currentPath = new Set(getPathToNode(tree, tree.currentId));

  // Collect all nodes with their timestamps, excluding current path
  const removableCandidates: Array<{ id: HistoryNodeId; timestamp: number; node: HistoryNode }> = [];

  for (const [id, node] of tree.nodes) {
    if (!currentPath.has(id)) {
      removableCandidates.push({ id, timestamp: node.timestamp, node });
    }
  }

  // Sort by timestamp (oldest first)
  removableCandidates.sort((a, b) => a.timestamp - b.timestamp);

  // Calculate how many nodes to remove
  const nodesToRemove = tree.nodes.size - maxNodes;

  // Create new nodes map
  const newNodes = new Map(tree.nodes);

  // Track which nodes we're removing
  const removedIds = new Set<HistoryNodeId>();

  // Remove oldest non-essential nodes
  for (let i = 0; i < Math.min(nodesToRemove, removableCandidates.length); i++) {
    const candidate = removableCandidates[i];

    // Remove this node
    newNodes.delete(candidate.id);
    removedIds.add(candidate.id);

    // Update parent's childIds to remove reference to this node
    if (candidate.node.parentId) {
      const parent = newNodes.get(candidate.node.parentId);
      if (parent) {
        newNodes.set(candidate.node.parentId, {
          ...parent,
          childIds: parent.childIds.filter(cid => cid !== candidate.id),
        });
      }
    }

    // Recursively remove all children of removed nodes (they become orphans)
    const removeChildren = (nodeId: HistoryNodeId) => {
      const node = newNodes.get(nodeId);
      if (!node) return;

      for (const childId of node.childIds) {
        if (!currentPath.has(childId)) {
          newNodes.delete(childId);
          removedIds.add(childId);
          removeChildren(childId);
        }
      }
    };

    removeChildren(candidate.id);
  }

  return {
    nodes: newNodes,
    rootId: tree.rootId,
    currentId: tree.currentId,
  };
}
