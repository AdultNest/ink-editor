/**
 * Knot Content Parser
 *
 * Parses the body content of an ink knot into structured KnotContentItem array.
 * This enables the visual editor to manipulate content as discrete blocks.
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
  ConditionalBranch,
  RawContentItem,
} from './inkTypes';

// ============================================================================
// Regex Patterns
// ============================================================================

/** Position comment pattern (should be skipped) */
const POSITION_COMMENT_PATTERN = /^\/\/\s*<\{.*\}>\s*$/;

/** Regular comment pattern */
const COMMENT_PATTERN = /^\/\//;

/** NPC image: <filename> (not starting with player-, video-, fake-type-, side-story-, wait-) */
const IMAGE_PATTERN = /^<(?!player-|video-|fake-type-|side-story-|wait-)([^>]+)>$/;

/** Player image: <player-filename> (not player-video-) */
const PLAYER_IMAGE_PATTERN = /^<player-(?!video-)([^>]+)>$/;

/** NPC video: <video-filename> */
const VIDEO_PATTERN = /^<video-([^>]+)>$/;

/** Player video: <player-video-filename> */
const PLAYER_VIDEO_PATTERN = /^<player-video-([^>]+)>$/;

/** Wait/pause: <wait-X> */
const WAIT_PATTERN = /^<wait-(\d+(?:\.\d+)?)>$/;

/** Fake typing indicator: <fake-type-X> */
const FAKE_TYPE_PATTERN = /^<fake-type-(\d+(?:\.\d+)?)>$/;

/** Side story trigger: <side-story-name> */
const SIDE_STORY_PATTERN = /^<side-story-([^>]+)>$/;

/** Custom transition: ~ ShowCustomTransition("title", "subtitle") */
const TRANSITION_PATTERN = /^~\s*ShowCustomTransition\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/;

/** Set story flag: ~ SetStoryFlag("flag") */
const FLAG_SET_PATTERN = /^~\s*SetStoryFlag\s*\(\s*"([^"]+)"\s*\)/;

/** Remove story flag: ~ RemoveStoryFlag("flag") */
const FLAG_REMOVE_PATTERN = /^~\s*RemoveStoryFlag\s*\(\s*"([^"]+)"\s*\)/;

/** Choice pattern: * or + with optional bracket text and divert */
const CHOICE_PATTERN = /^(\*|\+)\s*(?:\[([^\]]+)\]|([^->\n]+?))(?:\s*->\s*(\w+|END))?\s*$/;

/** Standalone divert: -> target */
const DIVERT_PATTERN = /^->\s*(\w+|END)\s*$/;

/** Conditional block start: { */
const CONDITIONAL_START_PATTERN = /^\{$/;

/** Conditional block end: } */
const CONDITIONAL_END_PATTERN = /^\}$/;

/** Conditional branch: - GetStoryFlag("flag"): or - else: */
const CONDITIONAL_BRANCH_PATTERN = /^-\s*(?:GetStoryFlag\s*\(\s*"([^"]+)"\s*\)|else)\s*:\s*$/;

// ============================================================================
// ID Generation
// ============================================================================

let idCounter = 0;

/**
 * Generate a unique ID for a content item
 */
function generateId(): string {
  return `content-${Date.now()}-${idCounter++}`;
}

/**
 * Reset the ID counter (useful for testing)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse knot body content into structured items
 *
 * @param bodyContent - The body content of the knot (without header line)
 * @returns Array of KnotContentItem
 */
export function parseKnotContent(bodyContent: string): KnotContentItem[] {
  const items: KnotContentItem[] = [];
  const lines = bodyContent.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Skip position comments
    if (POSITION_COMMENT_PATTERN.test(trimmed)) {
      i++;
      continue;
    }

    // Skip regular comments (but don't consume them as content)
    if (COMMENT_PATTERN.test(trimmed)) {
      i++;
      continue;
    }

    // Try to match patterns in order of specificity
    let item: KnotContentItem | null = null;
    let linesConsumed = 1;

    // Check for conditional block (multi-line)
    if (CONDITIONAL_START_PATTERN.test(trimmed)) {
      const result = parseConditionalBlock(lines, i);
      item = result.item;
      linesConsumed = result.linesConsumed;
    }
    // Check for player video
    else if (PLAYER_VIDEO_PATTERN.test(trimmed)) {
      const match = trimmed.match(PLAYER_VIDEO_PATTERN);
      if (match) {
        item = createPlayerVideoItem(match[1], i + 1);
      }
    }
    // Check for NPC video
    else if (VIDEO_PATTERN.test(trimmed)) {
      const match = trimmed.match(VIDEO_PATTERN);
      if (match) {
        item = createVideoItem(match[1], i + 1);
      }
    }
    // Check for player image
    else if (PLAYER_IMAGE_PATTERN.test(trimmed)) {
      const match = trimmed.match(PLAYER_IMAGE_PATTERN);
      if (match) {
        item = createPlayerImageItem(match[1], i + 1);
      }
    }
    // Check for fake type
    else if (FAKE_TYPE_PATTERN.test(trimmed)) {
      const match = trimmed.match(FAKE_TYPE_PATTERN);
      if (match) {
        item = createFakeTypeItem(parseFloat(match[1]), i + 1);
      }
    }
    // Check for wait
    else if (WAIT_PATTERN.test(trimmed)) {
      const match = trimmed.match(WAIT_PATTERN);
      if (match) {
        item = createWaitItem(parseFloat(match[1]), i + 1);
      }
    }
    // Check for side story
    else if (SIDE_STORY_PATTERN.test(trimmed)) {
      const match = trimmed.match(SIDE_STORY_PATTERN);
      if (match) {
        item = createSideStoryItem(match[1], i + 1);
      }
    }
    // Check for NPC image (must come after more specific patterns)
    else if (IMAGE_PATTERN.test(trimmed)) {
      const match = trimmed.match(IMAGE_PATTERN);
      if (match) {
        item = createImageItem(match[1], i + 1);
      }
    }
    // Check for transition
    else if (TRANSITION_PATTERN.test(trimmed)) {
      const match = trimmed.match(TRANSITION_PATTERN);
      if (match) {
        item = createTransitionItem(match[1], match[2], i + 1);
      }
    }
    // Check for flag set
    else if (FLAG_SET_PATTERN.test(trimmed)) {
      const match = trimmed.match(FLAG_SET_PATTERN);
      if (match) {
        item = createFlagOperationItem('set', match[1], i + 1);
      }
    }
    // Check for flag remove
    else if (FLAG_REMOVE_PATTERN.test(trimmed)) {
      const match = trimmed.match(FLAG_REMOVE_PATTERN);
      if (match) {
        item = createFlagOperationItem('remove', match[1], i + 1);
      }
    }
    // Check for choice (may have nested content on following lines)
    else if (CHOICE_PATTERN.test(trimmed)) {
      const result = parseChoice(lines, i);
      item = result.item;
      linesConsumed = result.linesConsumed;
    }
    // Check for standalone divert
    else if (DIVERT_PATTERN.test(trimmed)) {
      const match = trimmed.match(DIVERT_PATTERN);
      if (match) {
        item = createDivertItem(match[1], i + 1);
      }
    }
    // Default: treat as text message
    else {
      item = createTextItem(trimmed, i + 1);
    }

    if (item) {
      items.push(item);
    }

    i += linesConsumed;
  }

  return items;
}

/**
 * Parse a choice and any nested content
 */
function parseChoice(
  lines: string[],
  startIndex: number
): { item: ChoiceContentItem; linesConsumed: number } {
  const line = lines[startIndex];
  const trimmed = line.trim();
  const match = trimmed.match(CHOICE_PATTERN);

  if (!match) {
    // Fallback: shouldn't happen since we already tested the pattern
    return {
      item: {
        id: generateId(),
        type: 'choice',
        text: trimmed,
        isSticky: false,
        lineNumber: startIndex + 1,
      },
      linesConsumed: 1,
    };
  }

  const isSticky = match[1] === '+';
  const text = (match[2] || match[3] || '').trim();
  const divert = match[4];

  // Calculate the indentation level of this choice
  const choiceIndent = line.search(/\S/);

  // Look for nested content (lines indented more than the choice)
  const nestedLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length) {
    const nextLine = lines[i];
    const nextTrimmed = nextLine.trim();

    // Empty line could be part of nested content
    if (!nextTrimmed) {
      // Peek ahead to see if there's more nested content
      let hasMoreNested = false;
      for (let j = i + 1; j < lines.length; j++) {
        const peekLine = lines[j];
        const peekTrimmed = peekLine.trim();
        if (!peekTrimmed) continue;
        const peekIndent = peekLine.search(/\S/);
        if (peekIndent > choiceIndent) {
          hasMoreNested = true;
        }
        break;
      }
      if (hasMoreNested) {
        nestedLines.push('');
        i++;
        continue;
      }
      break;
    }

    // Check indentation
    const nextIndent = nextLine.search(/\S/);
    if (nextIndent <= choiceIndent) {
      // Not nested anymore
      break;
    }

    // This line is nested content
    nestedLines.push(nextTrimmed);
    i++;
  }

  // Parse nested content recursively
  let nestedContent: KnotContentItem[] | undefined;
  let nestedDivert: string | undefined = divert; // Start with inline divert if any

  if (nestedLines.length > 0) {
    nestedContent = parseKnotContent(nestedLines.join('\n'));
    // Filter out any raw items that are empty
    nestedContent = nestedContent.filter(
      (item) => !(item.type === 'raw' && !item.content.trim())
    );

    // Check if the last item is a divert - if so, extract it as the choice's divert
    if (nestedContent.length > 0) {
      const lastItem = nestedContent[nestedContent.length - 1];
      if (lastItem.type === 'divert') {
        nestedDivert = lastItem.target;
        nestedContent = nestedContent.slice(0, -1); // Remove the divert from nested content
      }
    }

    if (nestedContent.length === 0) {
      nestedContent = undefined;
    }
  }

  return {
    item: {
      id: generateId(),
      type: 'choice',
      text,
      isSticky,
      divert: nestedDivert,
      nestedContent,
      lineNumber: startIndex + 1,
    },
    linesConsumed: i - startIndex,
  };
}

/**
 * Parse a conditional block
 */
function parseConditionalBlock(
  lines: string[],
  startIndex: number
): { item: ConditionalContentItem; linesConsumed: number } {
  const branches: ConditionalBranch[] = [];
  let i = startIndex + 1; // Skip the opening {
  let currentBranch: ConditionalBranch | null = null;
  let currentBranchLines: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for end of conditional block
    if (CONDITIONAL_END_PATTERN.test(trimmed)) {
      // Finalize current branch
      if (currentBranch) {
        currentBranch.content = parseKnotContent(currentBranchLines.join('\n'));
        branches.push(currentBranch);
      }
      break;
    }

    // Check for new branch
    const branchMatch = trimmed.match(CONDITIONAL_BRANCH_PATTERN);
    if (branchMatch || trimmed === '- else:') {
      // Finalize previous branch
      if (currentBranch) {
        currentBranch.content = parseKnotContent(currentBranchLines.join('\n'));
        branches.push(currentBranch);
      }

      // Start new branch
      const isElse = trimmed.startsWith('- else');
      currentBranch = {
        flagName: isElse ? undefined : branchMatch?.[1],
        isElse,
        content: [],
      };
      currentBranchLines = [];
      i++;
      continue;
    }

    // Add line to current branch content
    if (currentBranch && trimmed) {
      // Check if this is a divert within the branch
      const divertMatch = trimmed.match(DIVERT_PATTERN);
      if (divertMatch) {
        currentBranch.divert = divertMatch[1];
      } else {
        currentBranchLines.push(trimmed);
      }
    }

    i++;
  }

  return {
    item: {
      id: generateId(),
      type: 'conditional',
      branches,
      lineNumber: startIndex + 1,
    },
    linesConsumed: i - startIndex + 1, // +1 for the closing }
  };
}

// ============================================================================
// Item Creation Helpers
// ============================================================================

function createTextItem(content: string, lineNumber: number): TextContentItem {
  return {
    id: generateId(),
    type: 'text',
    content,
    lineNumber,
  };
}

function createImageItem(filename: string, lineNumber: number): ImageContentItem {
  return {
    id: generateId(),
    type: 'image',
    filename,
    lineNumber,
  };
}

function createPlayerImageItem(
  filename: string,
  lineNumber: number
): PlayerImageContentItem {
  return {
    id: generateId(),
    type: 'player-image',
    filename,
    lineNumber,
  };
}

function createVideoItem(filename: string, lineNumber: number): VideoContentItem {
  return {
    id: generateId(),
    type: 'video',
    filename,
    lineNumber,
  };
}

function createPlayerVideoItem(
  filename: string,
  lineNumber: number
): PlayerVideoContentItem {
  return {
    id: generateId(),
    type: 'player-video',
    filename,
    lineNumber,
  };
}

function createFakeTypeItem(
  durationSeconds: number,
  lineNumber: number
): FakeTypeContentItem {
  return {
    id: generateId(),
    type: 'fake-type',
    durationSeconds,
    lineNumber,
  };
}

function createWaitItem(
  durationSeconds: number,
  lineNumber: number
): WaitContentItem {
  return {
    id: generateId(),
    type: 'wait',
    durationSeconds,
    lineNumber,
  };
}

function createSideStoryItem(
  storyName: string,
  lineNumber: number
): SideStoryContentItem {
  return {
    id: generateId(),
    type: 'side-story',
    storyName,
    lineNumber,
  };
}

function createTransitionItem(
  title: string,
  subtitle: string,
  lineNumber: number
): TransitionContentItem {
  return {
    id: generateId(),
    type: 'transition',
    title,
    subtitle,
    lineNumber,
  };
}

function createFlagOperationItem(
  operation: 'set' | 'remove',
  flagName: string,
  lineNumber: number
): FlagOperationContentItem {
  return {
    id: generateId(),
    type: 'flag-operation',
    operation,
    flagName,
    lineNumber,
  };
}

function createDivertItem(target: string, lineNumber: number): DivertContentItem {
  return {
    id: generateId(),
    type: 'divert',
    target,
    lineNumber,
  };
}

export function createRawItem(content: string, lineNumber: number): RawContentItem {
  return {
    id: generateId(),
    type: 'raw',
    content,
    lineNumber,
  };
}

// ============================================================================
// Default Item Creators (for adding new items in visual editor)
// ============================================================================

/**
 * Create a default content item of the specified type
 */
export function createDefaultItem(type: KnotContentItem['type']): KnotContentItem {
  switch (type) {
    case 'text':
      return { id: generateId(), type: 'text', content: '' };
    case 'image':
      return { id: generateId(), type: 'image', filename: '' };
    case 'player-image':
      return { id: generateId(), type: 'player-image', filename: '' };
    case 'video':
      return { id: generateId(), type: 'video', filename: '' };
    case 'player-video':
      return { id: generateId(), type: 'player-video', filename: '' };
    case 'fake-type':
      return { id: generateId(), type: 'fake-type', durationSeconds: 2 };
    case 'wait':
      return { id: generateId(), type: 'wait', durationSeconds: 2 };
    case 'side-story':
      return { id: generateId(), type: 'side-story', storyName: '' };
    case 'transition':
      return { id: generateId(), type: 'transition', title: '', subtitle: '' };
    case 'flag-operation':
      return { id: generateId(), type: 'flag-operation', operation: 'set', flagName: '' };
    case 'choice':
      return { id: generateId(), type: 'choice', text: '', isSticky: false };
    case 'divert':
      return { id: generateId(), type: 'divert', target: '' };
    case 'conditional':
      return { id: generateId(), type: 'conditional', branches: [] };
    case 'raw':
      return { id: generateId(), type: 'raw', content: '' };
  }
}
