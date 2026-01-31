/**
 * EndNode component
 *
 * Represents the END marker in an ink story.
 * Multiple knots can divert to END.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { EndNodeData } from '../parser/inkTypes';

import './InkNodes.css';

export type EndNodeType = Node<EndNodeData, 'endNode'>;

function EndNode({ data }: NodeProps<EndNodeType>) {
  return (
    <div className="ink-node ink-end-node">
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="ink-handle ink-handle-target"
      />
      <div className="ink-end-label">{data.label || 'END'}</div>
    </div>
  );
}

export default memo(EndNode);
