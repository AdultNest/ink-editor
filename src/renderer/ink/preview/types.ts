/**
 * Preview Component Types
 *
 * Types specific to preview rendering, designed for reuse in Live Playback.
 */

import type { KnotContentItem } from '../parser/inkTypes';
import type { CaretPosition } from '../hooks/useCaretNavigation';

/**
 * Mode for the preview renderer
 */
export type PreviewMode = 'edit' | 'preview' | 'playback';

/**
 * Props for the PreviewRenderer component
 */
export interface PreviewRendererProps {
  /** The content items to render */
  items: KnotContentItem[];
  /** The project path for resolving media files */
  projectPath: string;
  /** The rendering mode */
  mode: PreviewMode;
  /** Callback when an item is clicked (for editing or playback) */
  onItemClick?: (item: KnotContentItem, index: number) => void;
  /** Callback when a choice is selected (for playback) */
  onChoiceSelect?: (choice: { text: string; divert?: string }, index: number) => void;
  /** Currently selected item ID for visual highlighting */
  selectedItemId?: string | null;
  /** Current caret position for showing insertion point */
  caret?: CaretPosition;
}

/**
 * Props for MessageBubble component
 */
export interface MessageBubbleProps {
  /** The text content */
  content: string;
  /** Whether this is from the player or NPC */
  isPlayer: boolean;
  /** Optional timestamp */
  timestamp?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for ImageMessage component
 */
export interface ImageMessageProps {
  /** The image source URL */
  src: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Whether this is from the player or NPC */
  isPlayer: boolean;
  /** Whether the image file was found */
  isValid: boolean;
  /** The original filename */
  filename: string;
  /** Click handler for preview/expansion */
  onClick?: () => void;
}

/**
 * Props for VideoMessage component
 */
export interface VideoMessageProps {
  /** The video source URL */
  src: string;
  /** Whether this is from the player or NPC */
  isPlayer: boolean;
  /** Whether the video file was found */
  isValid: boolean;
  /** The original filename */
  filename: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for TypingIndicator component
 */
export interface TypingIndicatorProps {
  /** Duration in seconds (for display purposes) */
  duration: number;
  /** Whether to animate the dots */
  animated: boolean;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for ChoiceGroup component
 */
export interface ChoiceGroupProps {
  /** The choices to display */
  choices: Array<{
    text: string;
    isSticky: boolean;
    divert?: string;
  }>;
  /** Callback when a choice is clicked */
  onChoiceClick?: (index: number) => void;
  /** Whether choices are disabled (in edit mode) */
  disabled?: boolean;
}

/**
 * Props for TransitionCard component
 */
export interface TransitionCardProps {
  /** The main title */
  title: string;
  /** The subtitle */
  subtitle: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for SideStoryMarker component
 */
export interface SideStoryMarkerProps {
  /** The side story name */
  storyName: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for FlagOperationBadge component
 */
export interface FlagOperationBadgeProps {
  /** The operation type */
  operation: 'set' | 'remove';
  /** The flag name */
  flagName: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for DivertArrow component
 */
export interface DivertArrowProps {
  /** The divert target */
  target: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for PreviewContainer component
 */
export interface PreviewContainerProps {
  /** Child elements to render */
  children: React.ReactNode;
  /** Whether to auto-scroll to bottom */
  autoScroll?: boolean;
  /** Optional class name */
  className?: string;
}

/**
 * Props for ConditionalBlock preview component
 */
export interface ConditionalBlockProps {
  /** The branches in the conditional */
  branches: Array<{
    flagName?: string;
    isElse: boolean;
    content: KnotContentItem[];
    divert?: string;
  }>;
  /** The project path for media resolution */
  projectPath: string;
  /** The preview mode */
  mode: PreviewMode;
  /** Click handler */
  onClick?: () => void;
}
