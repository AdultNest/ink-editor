/**
 * Type definitions for the Ink parser
 */

/**
 * Represents a choice within a knot
 */
export interface InkChoice {
  /** The display text for the choice */
  text: string;
  /** The line number where this choice appears */
  lineNumber: number;
  /** The target knot name if the choice has a divert (-> target) */
  divert?: string;
  /** Whether this is a sticky choice (+) or once-only choice (*) */
  isSticky: boolean;
  /** The full raw line content */
  rawContent: string;
}

/**
 * Represents a divert with its location info
 */
export interface InkDivert {
  /** The target knot name (or END) */
  target: string;
  /** The line number where this divert appears */
  lineNumber: number;
  /** The context - what kind of line contains this divert */
  context: 'choice' | 'standalone' | 'inline' | 'conditional';
  /** The choice text if this divert is part of a choice */
  choiceText?: string;
  /** The flag name if this is a conditional divert (GetStoryFlag check) */
  conditionFlag?: string;
  /** Whether this is an else branch in a conditional block */
  isElseBranch?: boolean;
}

/**
 * Node position for graph layout persistence
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Represents a region (group) in an Ink file
 * Regions are defined using special comments:
 * // <# StartRegion: Region Name #>
 * // <{ "pos-x": 100, "pos-y": 200 }>
 * ... knots ...
 * // <# EndRegion #>
 */
export interface InkRegion {
  /** The unique name/header of the region */
  name: string;
  /** The line number where the region starts */
  lineStart: number;
  /** The line number where the region ends */
  lineEnd: number;
  /** Position of the region group */
  position?: NodePosition;
  /** Names of knots contained in this region */
  knotNames: string[];
}

/**
 * Represents a knot (section) in an Ink file
 */
export interface InkKnot {
  /** The unique name of the knot */
  name: string;
  /** The line number where the knot starts (the === line) */
  lineStart: number;
  /** The line number where the knot ends (before the next knot or EOF) */
  lineEnd: number;
  /** The full content of the knot (including the header line) */
  content: string;
  /** The content excluding the header line */
  bodyContent: string;
  /** All choices within this knot */
  choices: InkChoice[];
  /** All divert targets referenced in this knot (with location info) */
  diverts: InkDivert[];
  /** Saved node position from comment, if any */
  position?: NodePosition;
  /** Name of the region this knot belongs to, if any */
  regionName?: string;
  /** Story flag operations within this knot (Set/Remove) */
  storyFlags: InkStoryFlag[];
  /** Conditional blocks within this knot */
  conditionalBlocks: InkConditionalBlock[];
}

/**
 * Represents an EXTERNAL function declaration
 */
export interface InkExternal {
  /** The function name */
  name: string;
  /** The parameter names */
  params: string[];
  /** The line number where this external is declared */
  lineNumber: number;
}

/**
 * Represents a story flag operation (Set, Remove, or Check)
 */
export interface InkStoryFlag {
  /** The flag name */
  name: string;
  /** The operation type */
  operation: 'set' | 'remove' | 'check';
  /** The line number where this flag operation appears */
  lineNumber: number;
  /** For check operations, the divert target if the flag is true */
  divertTarget?: string;
}

/**
 * Represents a conditional divert based on flag checks
 */
export interface InkConditionalDivert {
  /** The flag being checked */
  flagName: string;
  /** The target knot if condition is true */
  target: string;
  /** The line number where this conditional divert appears */
  lineNumber: number;
}

/**
 * Represents a conditional block with multiple flag checks
 */
export interface InkConditionalBlock {
  /** The line number where the conditional block starts */
  lineStart: number;
  /** The line number where the conditional block ends */
  lineEnd: number;
  /** The branches in this conditional block */
  branches: InkConditionalBranch[];
  /** The else branch divert target, if any */
  elseDivert?: string;
}

/**
 * Represents a single branch in a conditional block
 */
export interface InkConditionalBranch {
  /** The flag being checked */
  flagName: string;
  /** The line number of this branch */
  lineNumber: number;
  /** The content text for this branch */
  content?: string;
  /** The divert target for this branch */
  divert?: string;
}

/**
 * Represents a parse error or warning
 */
export interface InkParseError {
  /** The error message */
  message: string;
  /** The line number where the error occurred */
  lineNumber: number;
  /** The severity of the error */
  severity: 'error' | 'warning';
}

/**
 * The result of parsing an Ink file
 */
export interface ParsedInk {
  /** All knots found in the file */
  knots: InkKnot[];
  /** All regions (groups) found in the file */
  regions: InkRegion[];
  /** All EXTERNAL declarations */
  externals: InkExternal[];
  /** The initial divert target (-> xxx before the first knot) */
  initialDivert?: string;
  /** Any parse errors or warnings */
  errors: InkParseError[];
  /** The raw source content */
  rawContent: string;
  /** Saved position for the START node */
  startPosition?: NodePosition;
  /** Saved position for the END node */
  endPosition?: NodePosition;
  /** All unique story flags used in the file */
  allStoryFlags: string[];
}

/**
 * Node data for a knot node in React Flow
 */
export interface KnotNodeData {
  [key: string]: unknown;
  /** The knot name */
  name: string;
  /** The body content to display */
  bodyContent: string;
  /** All diverts (used to create output handles) */
  diverts: InkDivert[];
  /** Conditional diverts (behind flag checks) - displayed separately */
  conditionalDiverts: InkDivert[];
  /** Whether this knot has parse errors */
  hasErrors: boolean;
  /** The full knot data */
  knot: InkKnot;
  /** Story flags set/removed in this knot */
  storyFlags: InkStoryFlag[];
}

/**
 * Node data for the START node
 */
export interface StartNodeData {
  [key: string]: unknown;
  /** The target knot name (from initial divert or first knot) */
  target: string;
}

/**
 * Node data for the END node
 */
export interface EndNodeData {
  [key: string]: unknown;
  /** Label to display */
  label: string;
}

/**
 * Node data for a region (group) node in React Flow
 */
export interface RegionNodeData {
  [key: string]: unknown;
  /** The region name/header */
  name: string;
  /** Names of knots contained in this region */
  knotNames: string[];
  /** The full region data */
  region: InkRegion;
}

// ============================================================================
// Knot Content Item Types (for Visual Knot Editor)
// ============================================================================

/**
 * Base interface for all knot content items
 */
export interface KnotContentItemBase {
  /** Unique ID for React keys and drag-drop */
  id: string;
  /** Original line number (for sync) */
  lineNumber?: number;
}

/**
 * Plain text message from NPC
 */
export interface TextContentItem extends KnotContentItemBase {
  type: 'text';
  /** The text content */
  content: string;
}

/**
 * Image sent by NPC: <image-filename>
 */
export interface ImageContentItem extends KnotContentItemBase {
  type: 'image';
  /** The filename (without path) */
  filename: string;
  /** Validation status */
  isValid?: boolean;
}

/**
 * Image sent by player: <player-image-filename>
 */
export interface PlayerImageContentItem extends KnotContentItemBase {
  type: 'player-image';
  /** The filename (without path, without player- prefix) */
  filename: string;
  /** Validation status */
  isValid?: boolean;
}

/**
 * Video sent by NPC: <video-filename>
 */
export interface VideoContentItem extends KnotContentItemBase {
  type: 'video';
  /** The filename (without path) */
  filename: string;
  /** Validation status */
  isValid?: boolean;
}

/**
 * Video sent by player: <player-video-filename>
 */
export interface PlayerVideoContentItem extends KnotContentItemBase {
  type: 'player-video';
  /** The filename (without path, without player-video- prefix) */
  filename: string;
  /** Validation status */
  isValid?: boolean;
}

/**
 * Typing indicator: <fake-type-X>
 */
export interface FakeTypeContentItem extends KnotContentItemBase {
  type: 'fake-type';
  /** Duration in seconds */
  durationSeconds: number;
}

/**
 * Wait/pause: <wait-X>
 */
export interface WaitContentItem extends KnotContentItemBase {
  type: 'wait';
  /** Duration in seconds */
  durationSeconds: number;
}

/**
 * Side story trigger: <side-story-name>
 */
export interface SideStoryContentItem extends KnotContentItemBase {
  type: 'side-story';
  /** The story name */
  storyName: string;
}

/**
 * Custom transition: ~ ShowCustomTransition("title", "subtitle")
 */
export interface TransitionContentItem extends KnotContentItemBase {
  type: 'transition';
  /** The transition title */
  title: string;
  /** The transition subtitle */
  subtitle: string;
}

/**
 * Story flag operation: ~ SetStoryFlag("flag") or ~ RemoveStoryFlag("flag")
 */
export interface FlagOperationContentItem extends KnotContentItemBase {
  type: 'flag-operation';
  /** The operation type */
  operation: 'set' | 'remove';
  /** The flag name */
  flagName: string;
}

/**
 * Player choice: * or + with optional divert
 */
export interface ChoiceContentItem extends KnotContentItemBase {
  type: 'choice';
  /** The choice text */
  text: string;
  /** Whether this is a sticky choice (+) or once-only (*) */
  isSticky: boolean;
  /** Optional divert target */
  divert?: string;
  /** Content that appears after choosing (before divert) */
  nestedContent?: KnotContentItem[];
}

/**
 * Standalone divert: -> target
 */
export interface DivertContentItem extends KnotContentItemBase {
  type: 'divert';
  /** The target knot name or END */
  target: string;
}

/**
 * Conditional block with flag checks
 */
export interface ConditionalContentItem extends KnotContentItemBase {
  type: 'conditional';
  /** The branches in this conditional */
  branches: ConditionalBranch[];
}

/**
 * A branch within a conditional block
 */
export interface ConditionalBranch {
  /** The flag being checked (undefined for else branch) */
  flagName?: string;
  /** Whether this is the else branch */
  isElse: boolean;
  /** Content within this branch */
  content: KnotContentItem[];
  /** Optional divert at end of branch */
  divert?: string;
}

/**
 * Raw ink line (fallback for unrecognized content)
 */
export interface RawContentItem extends KnotContentItemBase {
  type: 'raw';
  /** The raw ink content */
  content: string;
}

/**
 * Union type for all knot content items
 */
export type KnotContentItem =
  | TextContentItem
  | ImageContentItem
  | PlayerImageContentItem
  | VideoContentItem
  | PlayerVideoContentItem
  | FakeTypeContentItem
  | WaitContentItem
  | SideStoryContentItem
  | TransitionContentItem
  | FlagOperationContentItem
  | ChoiceContentItem
  | DivertContentItem
  | ConditionalContentItem
  | RawContentItem;

/**
 * Helper type for content item type strings
 */
export type KnotContentItemType = KnotContentItem['type'];
