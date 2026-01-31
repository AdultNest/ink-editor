import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ImageNodeData {
  src: string;
  alt?: string;
  label?: string;
}

function ImageNode({ data }: NodeProps<ImageNodeData>) {
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
