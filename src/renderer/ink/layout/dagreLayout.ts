/**
 * Dagre-based layout algorithms
 *
 * Uses dagre for hierarchical graph layouts.
 * Supports both horizontal (LR) and vertical (TB) directions.
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import { DEFAULT_LAYOUT_CONFIG, type LayoutConfig } from './types';

type Direction = 'LR' | 'TB';

/**
 * Apply dagre layout to nodes and edges
 *
 * @param nodes - React Flow nodes to layout
 * @param edges - React Flow edges for connectivity
 * @param direction - 'LR' for horizontal, 'TB' for vertical
 * @param config - Layout configuration
 * @returns Map of node IDs to new positions
 */
export function dagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: Direction = 'LR',
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Map<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, nodeSpacingX, nodeSpacingY } = config;

  // Create a new dagre graph
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  // Configure the graph
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? nodeSpacingY : nodeSpacingX,
    ranksep: direction === 'LR' ? nodeSpacingX + nodeWidth : nodeSpacingY + nodeHeight,
    marginx: config.startX,
    marginy: config.startY,
  });

  // Add nodes to the graph
  for (const node of nodes) {
    g.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  }

  // Add edges to the graph
  for (const edge of edges) {
    // Only add edges between nodes that exist in our layout
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  // Run the dagre layout algorithm
  dagre.layout(g);

  // Extract positions from dagre
  // Note: dagre positions nodes at their center, but React Flow uses top-left
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positions.set(node.id, {
        x: dagreNode.x - nodeWidth / 2,
        y: dagreNode.y - nodeHeight / 2,
      });
    }
  }

  return positions;
}

/**
 * Horizontal hierarchical layout (left to right)
 */
export function hierarchicalLayout(
  nodes: Node[],
  edges: Edge[],
  config?: LayoutConfig
): Map<string, { x: number; y: number }> {
  return dagreLayout(nodes, edges, 'LR', config);
}

/**
 * Vertical hierarchical layout (top to bottom)
 */
export function verticalLayout(
  nodes: Node[],
  edges: Edge[],
  config?: LayoutConfig
): Map<string, { x: number; y: number }> {
  return dagreLayout(nodes, edges, 'TB', config);
}
