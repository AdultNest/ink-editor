/**
 * HistoryPanel component
 *
 * Sidebar panel displaying the history tree with branching.
 * Shows all history nodes and allows jumping to any point in history.
 */

import { useMemo } from 'react';
import type { HistoryNodeId, HistoryNodeViewItem } from '../history';

import './HistoryPanel.css';

export interface HistoryPanelProps {
  /** Flattened tree view of history nodes */
  treeView: HistoryNodeViewItem[];
  /** Currently active history node ID */
  currentId: HistoryNodeId | null;
  /** Callback when a history node is clicked */
  onNodeClick: (nodeId: HistoryNodeId) => void;
}

/**
 * Format a timestamp as a relative time string.
 */
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'just now';
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Get icon for operation type.
 */
function getOperationIcon(type: string): string {
  switch (type) {
    case 'edit': return '✎';
    case 'add': return '+';
    case 'delete': return '−';
    case 'move': return '↔';
    case 'rename': return '⇄';
    case 'layout': return '⊞';
    default: return '•';
  }
}

export function HistoryPanel({ treeView, currentId, onNodeClick }: HistoryPanelProps) {
  // Count total history nodes
  const nodeCount = treeView.length;

  // Check if the tree has any branches at all
  const hasBranches = useMemo(() => {
    return treeView.some(item => item.hasSiblings);
  }, [treeView]);

  // Build a map of which depths have continuing branches (for vertical lines)
  const branchingDepths = useMemo(() => {
    if (!hasBranches) return new Set<number>();

    const depths = new Set<number>();
    // Track which parent nodes have remaining children to show
    const parentChildCounts = new Map<string, number>();

    for (const item of treeView) {
      if (item.node.parentId && item.hasSiblings && !item.isLastChild) {
        // This node has siblings after it, so its depth needs a continuing line
        depths.add(item.depth);
      }
    }
    return depths;
  }, [treeView, hasBranches]);

  if (nodeCount === 0) {
    return (
      <div className="history-panel">
        <div className="history-panel-header">
          <h3 className="history-panel-title">History</h3>
        </div>
        <div className="history-panel-empty">
          No history yet.
          <div className="history-panel-hint">
            Make changes to build history.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-panel-header">
        <h3 className="history-panel-title">History</h3>
        <span className="history-panel-count">{nodeCount}</span>
      </div>

      <div className="history-panel-list">
        {treeView.map((item) => {
          const { node, depth, isOnCurrentPath, isCurrent, hasSiblings, siblingIndex, isLastChild } = item;

          // Build tree connector characters - only show when there are actual branches
          let connector = '';
          if (hasBranches && depth > 0 && hasSiblings) {
            // Add spacing for ancestor depths that have continuing branches
            for (let d = 1; d < depth; d++) {
              connector += branchingDepths.has(d) ? '│ ' : '  ';
            }

            // Add the branch connector for this node
            if (isLastChild) {
              connector += '└─';
            } else {
              connector += '├─';
            }
          }

          return (
            <div
              key={node.id}
              className={`history-panel-node ${isOnCurrentPath ? 'history-panel-node-path' : ''} ${isCurrent ? 'history-panel-node-current' : ''}`}
              onClick={() => onNodeClick(node.id)}
              title={`${node.operation.description}\n${new Date(node.timestamp).toLocaleString()}`}
            >
              {connector && (
                <div className="history-panel-node-connector">
                  <span className="history-panel-connector-text">{connector}</span>
                </div>
              )}

              <div className="history-panel-node-content">
                <span className={`history-panel-node-icon history-panel-icon-${node.operation.type}`}>
                  {getOperationIcon(node.operation.type)}
                </span>

                <span className="history-panel-node-desc">
                  {node.operation.description}
                </span>

                {node.operation.target && (
                  <span className="history-panel-node-target">
                    {node.operation.target}
                  </span>
                )}

                <span className="history-panel-node-time">
                  {formatTime(node.timestamp)}
                </span>

                {isCurrent && (
                  <span className="history-panel-node-badge">NOW</span>
                )}

                {hasSiblings && siblingIndex > 0 && !isCurrent && (
                  <span className="history-panel-node-branch-badge">
                    Branch {siblingIndex + 1}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="history-panel-footer">
        <div className="history-panel-shortcuts">
          <span className="history-panel-shortcut">
            <kbd>Ctrl+Z</kbd> Undo
          </span>
          <span className="history-panel-shortcut">
            <kbd>Ctrl+Shift+Z</kbd> Redo
          </span>
        </div>
      </div>
    </div>
  );
}

export default HistoryPanel;
