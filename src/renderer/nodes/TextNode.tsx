import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface TextNodeData {
  label: string;
}

function TextNode({ data }: NodeProps<TextNodeData>) {
  return (
    <div className="text-node">
      <Handle type="target" position={Position.Top} />
      <div className="text-node-content">
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default TextNode;
