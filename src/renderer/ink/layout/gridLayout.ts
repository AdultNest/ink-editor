/**
 * Grid layout algorithm
 *
 * Arranges nodes in a simple grid pattern, sorted alphabetically.
 */

import type { Node } from '@xyflow/react';
import { DEFAULT_LAYOUT_CONFIG, type LayoutConfig } from './types';

/**
 * Apply grid layout to nodes
 *
 * @param nodes - React Flow nodes to layout
 * @param config - Layout configuration
 * @returns Map of node IDs to new positions
 */
export function gridLayout(
  nodes: Node[],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Map<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, nodeSpacingX, nodeSpacingY, startX, startY } = config;

  // Sort nodes alphabetically by ID for predictable layout
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));

  // Calculate number of columns based on node count
  // Aim for roughly square aspect ratio
  const cols = Math.max(1, Math.ceil(Math.sqrt(sortedNodes.length)));

  const positions = new Map<string, { x: number; y: number }>();

  sortedNodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    positions.set(node.id, {
      x: startX + col * (nodeWidth + nodeSpacingX),
      y: startY + row * (nodeHeight + nodeSpacingY),
    });
  });

  return positions;
}
