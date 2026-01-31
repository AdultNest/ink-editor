import TextNode, { type TextNodeData } from './TextNode';
import ImageNode, { type ImageNodeData } from './ImageNode';

/**
 * Custom node types registry for React Flow.
 * CRITICAL: This object MUST be defined at module level (outside any React component)
 * to prevent infinite re-renders when passed to the ReactFlow component.
 */
export const nodeTypes = {
  textNode: TextNode,
  imageNode: ImageNode,
} as const;

// Re-export node components and their data types for convenience
export { TextNode, ImageNode };
export type { TextNodeData, ImageNodeData };
