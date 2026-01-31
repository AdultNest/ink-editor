import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface ImageNodeData {
  [key: string]: unknown;
  src: string;
  alt?: string;
  label?: string;
}

export type ImageNodeType = Node<ImageNodeData, 'imageNode'>;

function ImageNode({ data }: NodeProps<ImageNodeType>) {
  return (
    <div className="image-node">
      <Handle type="target" position={Position.Top} />
      <div className="image-node-content">
        {data.label && <div className="image-node-label">{data.label}</div>}
        <img src={data.src} alt={data.alt || 'Image'} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default ImageNode;
