/**
 * Ink nodes module exports
 */

import KnotNode, { type KnotNodeType, parseHandleId } from './KnotNode';
import StartNode, { type StartNodeType } from './StartNode';
import EndNode, { type EndNodeType } from './EndNode';
import RegionNode, { type RegionNodeType } from './RegionNode';

/**
 * Custom node types for ink editor React Flow
 * CRITICAL: This object MUST be defined at module level (outside any React component)
 * to prevent infinite re-renders when passed to the ReactFlow component.
 */
export const inkNodeTypes = {
  knotNode: KnotNode,
  startNode: StartNode,
  endNode: EndNode,
  regionNode: RegionNode,
} as const;

export { KnotNode, StartNode, EndNode, RegionNode, parseHandleId };
export type { KnotNodeType, StartNodeType, EndNodeType, RegionNodeType };

// Union type for all ink nodes
export type InkNodeType = KnotNodeType | StartNodeType | EndNodeType | RegionNodeType;
