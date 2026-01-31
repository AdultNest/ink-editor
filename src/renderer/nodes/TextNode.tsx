import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface TextNodeData {
  [key: string]: unknown;
  label: string;
}

export type TextNodeType = Node<TextNodeData, 'textNode'>;

function TextNode({ data }: NodeProps<TextNodeType>) {
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
