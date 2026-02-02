/**
 * Knot Content Serializer
 *
 * Serializes KnotContentItem array back into ink syntax.
 * This enables round-trip editing in the visual editor.
 */

import type {
  KnotContentItem,
  TextContentItem,
  ImageContentItem,
  PlayerImageContentItem,
  VideoContentItem,
  PlayerVideoContentItem,
  FakeTypeContentItem,
  WaitContentItem,
  SideStoryContentItem,
  TransitionContentItem,
  FlagOperationContentItem,
  ChoiceContentItem,
  DivertContentItem,
  ConditionalContentItem,
  RawContentItem,
  StitchContentItem,
  NodePosition,
} from './inkTypes';

/**
 * Format a position comment for persistence
 */
function formatPositionComment(position: NodePosition): string {
  return `// <{ "pos-x": ${position.x.toFixed(1)}, "pos-y": ${position.y.toFixed(1)} }>`;
}

/**
 * Serialize structured items back to ink syntax
 *
 * @param items - Array of KnotContentItem to serialize
 * @param preservePosition - Optional position to include as comment
 * @returns Serialized ink content string
 */
export function serializeKnotContent(
  items: KnotContentItem[],
  preservePosition?: NodePosition
): string {
  const lines: string[] = [];

  // Add position comment if exists
  if (preservePosition) {
    lines.push(formatPositionComment(preservePosition));
  }

  for (const item of items) {
    const serialized = serializeItem(item);
    lines.push(...serialized);
  }

  return lines.join('\n');
}

/**
 * Serialize a single item to ink lines
 */
function serializeItem(item: KnotContentItem, indent = ''): string[] {
  switch (item.type) {
    case 'text':
      return serializeTextItem(item, indent);
    case 'image':
      return serializeImageItem(item, indent);
    case 'player-image':
      return serializePlayerImageItem(item, indent);
    case 'video':
      return serializeVideoItem(item, indent);
    case 'player-video':
      return serializePlayerVideoItem(item, indent);
    case 'fake-type':
      return serializeFakeTypeItem(item, indent);
    case 'wait':
      return serializeWaitItem(item, indent);
    case 'side-story':
      return serializeSideStoryItem(item, indent);
    case 'transition':
      return serializeTransitionItem(item, indent);
    case 'flag-operation':
      return serializeFlagOperationItem(item, indent);
    case 'choice':
      return serializeChoiceItem(item, indent);
    case 'divert':
      return serializeDivertItem(item, indent);
    case 'conditional':
      return serializeConditionalItem(item, indent);
    case 'raw':
      return serializeRawItem(item, indent);
    case 'stitch':
      return serializeStitchItem(item, indent);
    default:
      return [];
  }
}

function serializeTextItem(item: TextContentItem, indent: string): string[] {
  if (!item.content.trim()) return [];
  return [`${indent}${item.content}`];
}

function serializeImageItem(item: ImageContentItem, indent: string): string[] {
  if (!item.filename) return [];
  return [`${indent}<${item.filename}>`];
}

function serializePlayerImageItem(item: PlayerImageContentItem, indent: string): string[] {
  if (!item.filename) return [];
  return [`${indent}<player-${item.filename}>`];
}

function serializeVideoItem(item: VideoContentItem, indent: string): string[] {
  if (!item.filename) return [];
  return [`${indent}<video-${item.filename}>`];
}

function serializePlayerVideoItem(item: PlayerVideoContentItem, indent: string): string[] {
  if (!item.filename) return [];
  return [`${indent}<player-video-${item.filename}>`];
}

function serializeFakeTypeItem(item: FakeTypeContentItem, indent: string): string[] {
  return [`${indent}<fake-type-${item.durationSeconds}>`];
}

function serializeWaitItem(item: WaitContentItem, indent: string): string[] {
  return [`${indent}<wait-${item.durationSeconds}>`];
}

function serializeSideStoryItem(item: SideStoryContentItem, indent: string): string[] {
  if (!item.storyName) return [];
  return [`${indent}<side-story-${item.storyName}>`];
}

function serializeTransitionItem(item: TransitionContentItem, indent: string): string[] {
  return [`${indent}~ ShowCustomTransition("${item.title}", "${item.subtitle}")`];
}

function serializeFlagOperationItem(item: FlagOperationContentItem, indent: string): string[] {
  if (!item.flagName) return [];
  const fn = item.operation === 'set' ? 'SetStoryFlag' : 'RemoveStoryFlag';
  return [`${indent}~ ${fn}("${item.flagName}")`];
}

function serializeChoiceItem(item: ChoiceContentItem, indent: string): string[] {
  const lines: string[] = [];
  const prefix = item.isSticky ? '+' : '*';
  const nestedIndent = indent + '    ';

  // Choice text on its own line
  lines.push(`${indent}${prefix} [${item.text}]`);

  // If there's nested content, serialize it
  if (item.nestedContent && item.nestedContent.length > 0) {
    for (const nestedItem of item.nestedContent) {
      lines.push(...serializeItem(nestedItem, nestedIndent));
    }
  }

  // Divert always goes on its own indented line (if present)
  if (item.divert) {
    lines.push(`${nestedIndent}-> ${item.divert}`);
  }

  return lines;
}

function serializeDivertItem(item: DivertContentItem, indent: string): string[] {
  if (!item.target) return [];
  return [`${indent}-> ${item.target}`];
}

function serializeConditionalItem(item: ConditionalContentItem, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}{`);

  for (const branch of item.branches) {
    // Branch header
    if (branch.isElse) {
      lines.push(`${indent}    - else:`);
    } else if (branch.flagName) {
      lines.push(`${indent}    - GetStoryFlag("${branch.flagName}"):`);
    }

    // Branch content
    for (const contentItem of branch.content) {
      lines.push(...serializeItem(contentItem, indent + '        '));
    }

    // Branch divert
    if (branch.divert) {
      lines.push(`${indent}        -> ${branch.divert}`);
    }
  }

  lines.push(`${indent}}`);

  return lines;
}

function serializeRawItem(item: RawContentItem, indent: string): string[] {
  if (!item.content.trim()) return [];
  return [`${indent}${item.content}`];
}

function serializeStitchItem(item: StitchContentItem, indent: string): string[] {
  const lines: string[] = [];

  // Stitch header
  lines.push(`${indent}= ${item.name}`);

  // Stitch content
  for (const contentItem of item.content) {
    lines.push(...serializeItem(contentItem, indent));
  }

  return lines;
}

/**
 * Serialize items with validation
 * Returns errors if items have issues
 */
export function serializeWithValidation(
  items: KnotContentItem[],
  preservePosition?: NodePosition
): { content: string; errors: string[] } {
  const errors: string[] = [];

  // Validate items before serializing
  for (const item of items) {
    const itemErrors = validateItem(item);
    errors.push(...itemErrors);
  }

  const content = serializeKnotContent(items, preservePosition);

  return { content, errors };
}

/**
 * Validate a single item
 */
function validateItem(item: KnotContentItem): string[] {
  const errors: string[] = [];

  switch (item.type) {
    case 'image':
    case 'player-image':
    case 'video':
    case 'player-video':
      if (!item.filename) {
        errors.push(`${item.type} item is missing filename`);
      }
      break;
    case 'side-story':
      if (!item.storyName) {
        errors.push('Side story item is missing story name');
      }
      break;
    case 'flag-operation':
      if (!item.flagName) {
        errors.push('Flag operation item is missing flag name');
      }
      break;
    case 'choice':
      if (!item.text) {
        errors.push('Choice item is missing text');
      }
      if (!item.divert) {
        errors.push('Choice must have a divert target (dangling choice)');
      }
      break;
    case 'divert':
      if (!item.target) {
        errors.push('Divert item is missing target');
      }
      break;
    case 'stitch':
      if (!item.name) {
        errors.push('Stitch item is missing name');
      }
      break;
  }

  return errors;
}
