/**
 * RegionNode component
 *
 * Represents a region (group) in the ink file graph.
 * Acts as a visual container for knot nodes that belong to this region.
 * Note: This is a visual-only container - knots are not React Flow children.
 */

import { memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import type { RegionNodeData } from '../parser/inkTypes';

import './InkNodes.css';

export type RegionNodeType = Node<RegionNodeData, 'regionNode'>;

function RegionNode({ data, selected }: NodeProps<RegionNodeType>) {
  const { name, knotNames } = data;

  return (
    <div
      className={`ink-node ink-region-node ${selected ? 'ink-node-selected' : ''}`}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Header with region name */}
      <div className="ink-region-header">
        <span className="ink-region-name">{name}</span>
        <span className="ink-region-count">{knotNames.length} knots</span>
      </div>
    </div>
  );
}

export default memo(RegionNode);
