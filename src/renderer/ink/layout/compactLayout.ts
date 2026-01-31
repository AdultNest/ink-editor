/**
 * Compact cluster layout algorithm
 *
 * Groups connected components together and lays out each cluster separately.
 * Useful for visualizing story structure and finding orphaned content.
 */

import type { Node, Edge } from '@xyflow/react';
import { DEFAULT_LAYOUT_CONFIG, type LayoutConfig } from './types';

/**
 * Union-Find data structure for finding connected components
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  makeSet(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      // Path compression
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX !== rootY) {
      // Union by rank
      const rankX = this.rank.get(rootX)!;
      const rankY = this.rank.get(rootY)!;

      if (rankX < rankY) {
        this.parent.set(rootX, rootY);
      } else if (rankX > rankY) {
        this.parent.set(rootY, rootX);
      } else {
        this.parent.set(rootY, rootX);
        this.rank.set(rootX, rankX + 1);
      }
    }
  }
}

/**
 * Apply compact cluster layout to nodes
 *
 * @param nodes - React Flow nodes to layout
 * @param edges - React Flow edges for connectivity analysis
 * @param config - Layout configuration
 * @returns Map of node IDs to new positions
 */
export function compactLayout(
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Map<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, nodeSpacingX, nodeSpacingY, startX, startY } = config;

  // Build set of node IDs for quick lookup
  const nodeIds = new Set(nodes.map(n => n.id));

  // Initialize Union-Find with all nodes
  const uf = new UnionFind();
  for (const node of nodes) {
    uf.makeSet(node.id);
  }

  // Union nodes that are connected by edges
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      uf.union(edge.source, edge.target);
    }
  }

  // Group nodes by their connected component
  const clusters = new Map<string, Node[]>();
  for (const node of nodes) {
    const root = uf.find(node.id);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(node);
  }

  // Sort clusters by size (largest first)
  const sortedClusters = Array.from(clusters.values()).sort((a, b) => b.length - a.length);

  const positions = new Map<string, { x: number; y: number }>();
  let clusterOffsetX = startX;
  const clusterGap = nodeWidth * 1.5; // Extra gap between clusters

  for (const cluster of sortedClusters) {
    // Sort nodes within cluster alphabetically
    const sortedNodes = [...cluster].sort((a, b) => a.id.localeCompare(b.id));

    // Calculate grid dimensions for this cluster
    const cols = Math.max(1, Math.ceil(Math.sqrt(sortedNodes.length)));
    const rows = Math.ceil(sortedNodes.length / cols);

    // Position nodes in a grid within the cluster
    sortedNodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      positions.set(node.id, {
        x: clusterOffsetX + col * (nodeWidth + nodeSpacingX),
        y: startY + row * (nodeHeight + nodeSpacingY),
      });
    });

    // Move offset for next cluster
    const clusterWidth = cols * (nodeWidth + nodeSpacingX);
    clusterOffsetX += clusterWidth + clusterGap;
  }

  return positions;
}
