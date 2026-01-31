/**
 * StartNode component
 *
 * Represents the entry point of the ink story.
 * Connects to the initial divert target or the first knot.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { StartNodeData } from '../parser/inkTypes';

import './InkNodes.css';

export type StartNodeType = Node<StartNodeData, 'startNode'>;

function StartNode({ data }: NodeProps<StartNodeType>) {
  return (
    <div className="ink-node ink-start-node">
      <div className="ink-start-label">START</div>
      {data.target && (
        <div className="ink-start-target" title={`Initial target: ${data.target}`}>
          {data.target}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="ink-handle ink-handle-source"
      />
    </div>
  );
}

export default memo(StartNode);
