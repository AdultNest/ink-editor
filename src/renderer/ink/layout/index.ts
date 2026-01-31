/**
 * Layout module
 *
 * Provides multiple auto-layout algorithms for organizing ink story nodes.
 */

export { hierarchicalLayout, verticalLayout, dagreLayout } from './dagreLayout';
export { gridLayout } from './gridLayout';
export { compactLayout } from './compactLayout';
export { DEFAULT_LAYOUT_CONFIG } from './types';
export type { LayoutAlgorithm, LayoutConfig } from './types';

import type { Node, Edge } from '@xyflow/react';
import type { LayoutAlgorithm, LayoutConfig } from './types';
import { DEFAULT_LAYOUT_CONFIG } from './types';
import { hierarchicalLayout, verticalLayout } from './dagreLayout';
import { gridLayout } from './gridLayout';
import { compactLayout } from './compactLayout';

/**
 * Calculate layout positions using the specified algorithm
 *
 * @param algorithm - The layout algorithm to use
 * @param nodes - React Flow nodes to layout
 * @param edges - React Flow edges for connectivity
 * @param config - Optional layout configuration
 * @returns Map of node IDs to new positions
 */
export function calculateLayout(
  algorithm: LayoutAlgorithm,
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Map<string, { x: number; y: number }> {
  switch (algorithm) {
    case 'hierarchical':
      return hierarchicalLayout(nodes, edges, config);
    case 'vertical':
      return verticalLayout(nodes, edges, config);
    case 'grid':
      return gridLayout(nodes, config);
    case 'compact':
      return compactLayout(nodes, edges, config);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = algorithm;
      throw new Error(`Unknown layout algorithm: ${_exhaustive}`);
  }
}
