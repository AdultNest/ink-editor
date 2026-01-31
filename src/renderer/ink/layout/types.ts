/**
 * Layout algorithm types
 */

export type LayoutAlgorithm = 'hierarchical' | 'vertical' | 'grid' | 'compact';

export interface LayoutConfig {
  /** Node width for layout calculations */
  nodeWidth: number;
  /** Node height for layout calculations */
  nodeHeight: number;
  /** Horizontal spacing between nodes */
  nodeSpacingX: number;
  /** Vertical spacing between nodes */
  nodeSpacingY: number;
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 350,
  nodeHeight: 250,
  nodeSpacingX: 100,
  nodeSpacingY: 50,
  startX: 50,
  startY: 100,
};
