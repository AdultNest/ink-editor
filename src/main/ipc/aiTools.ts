/**
 * AI Tools for Conversation-Based Generation
 *
 * Defines tools available to the LLM for investigating story structure,
 * creating/modifying knots, and generating images.
 */

import fs from 'fs/promises';
import path from 'path';
import { BrowserWindow } from 'electron';
import type { ConversationSession, ToolResult } from './aiSessionManager';
import { addCreatedKnot, addModifiedKnot } from './aiSessionManager';

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
}

/**
 * Tool definition for Ollama
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

/**
 * Parsed knot structure (simplified for tools)
 */
interface ParsedKnot {
  name: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  diverts: string[];
  choices: Array<{ text: string; target?: string }>;
}

/**
 * Parsed ink file (simplified)
 */
interface ParsedInk {
  knots: ParsedKnot[];
  initialDivert?: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'investigate_knot_tree',
      description: 'Trace backwards through the story to see what knots lead to a specific knot. Returns a list of knots that divert to the target knot, helping understand the story flow.',
      parameters: {
        type: 'object',
        properties: {
          knot_name: {
            type: 'string',
            description: 'The name of the knot to investigate (what leads to this knot)',
          },
          depth: {
            type: 'number',
            description: 'How many levels deep to trace backwards (default: 2)',
          },
        },
        required: ['knot_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_knot_content',
      description: 'Read the full content of a specific knot including its dialogue, choices, and diverts.',
      parameters: {
        type: 'object',
        properties: {
          knot_name: {
            type: 'string',
            description: 'The name of the knot to read',
          },
        },
        required: ['knot_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_knots',
      description: 'List all knots in the story with brief previews of their content. Use this to understand the overall story structure.',
      parameters: {
        type: 'object',
        properties: {
          include_preview: {
            type: 'boolean',
            description: 'Whether to include a brief content preview for each knot (default: true)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_knot',
      description: `Create a new knot in the story. The knot content should include dialogue and end with either choices or a divert. Changes are immediately saved to the file.

IMPORTANT: When a player choice has content (like <player-image.png>) and needs more choices afterward without leaving the knot, use STITCHES:

Example with stitches:
\`\`\`
What do you want?
* [Send a selfie]
    <player-selfie.png>
    Cute!
    -> knot_name.after_selfie
= after_selfie
* [Send another] -> more_photos
* [Done] -> goodbye
\`\`\`

Stitch names must use only [a-zA-Z_0-9].`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the new knot (must be unique, use snake_case)',
          },
          content: {
            type: 'string',
            description: 'The full ink content for the knot body. Include stitches (= stitch_name) when player choices have content that needs continuation. Do NOT include the knot header (=== name ===).',
          },
        },
        required: ['name', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_knot',
      description: `Edit the content of an existing knot. The entire knot content will be replaced with the new content.

Remember to use STITCHES when player choices have content and need continuation:
\`\`\`
* [Player action]
    <player-image.png>
    Response text
    -> knot_name.after_action
= after_action
* [Next choice] -> somewhere
\`\`\``,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the knot to modify',
          },
          new_content: {
            type: 'string',
            description: 'The new full ink content for the knot body. Include stitches when needed. Do NOT include the knot header (=== name ===).',
          },
        },
        required: ['name', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_image_options',
      description: 'List all available options for image generation including character presets, mood sets, and prompt library components. Call this before generate_image to see what options are available.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: `Generate an image for a scene using the AI image generator. Returns an ink tag that can be included in knot content.

Use list_image_options first to see available presets, moods, and library components.

Shot types control which body parts are included:
- "portrait": Head/face only (for close-up expressions)
- "upper_body": Head and torso (for dialogue scenes)
- "full_body": Entire character (for action/poses)
- "custom": Specify exact regions with the regions parameter

Regions (for custom shot_type):
- "HEAD": Face, hair, expressions
- "UPPER_BODY": Shoulders, chest, arms
- "LOWER_BODY": Hips, legs
- "FULL_BODY": General body type`,
      parameters: {
        type: 'object',
        properties: {
          scene_description: {
            type: 'string',
            description: 'Description of the scene/pose/action (e.g., "smiling warmly at camera", "sitting on bed looking shy")',
          },
          shot_type: {
            type: 'string',
            description: 'Controls which body parts to include: "portrait", "upper_body", "full_body", or "custom"',
            enum: ['portrait', 'upper_body', 'full_body', 'custom'],
          },
          regions: {
            type: 'array',
            description: 'For shot_type="custom": specify exact regions to include',
            items: { type: 'string' },
          },
          include_character: {
            type: 'boolean',
            description: 'Whether to include character appearance (default: true). Set false for backgrounds/objects only.',
          },
          image_preset_name: {
            type: 'string',
            description: 'Name of a character image preset/style to use (from list_image_options)',
          },
          mood_name: {
            type: 'string',
            description: 'Name of a mood set to apply (from list_image_options)',
          },
          location_id: {
            type: 'string',
            description: 'Prompt library location ID (from list_image_options)',
          },
          clothing_id: {
            type: 'string',
            description: 'Prompt library clothing ID (from list_image_options)',
          },
          action_id: {
            type: 'string',
            description: 'Prompt library action ID (from list_image_options)',
          },
          time_weather_id: {
            type: 'string',
            description: 'Prompt library time/weather ID (from list_image_options)',
          },
          custom_positive: {
            type: 'string',
            description: 'Additional positive prompt tags to add',
          },
          custom_negative: {
            type: 'string',
            description: 'Additional negative prompt tags to add',
          },
        },
        required: ['scene_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_goal_complete',
      description: 'Signal that the user\'s goal has been achieved and the session should end. Call this when you have successfully completed what the user asked for.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A brief summary of what was accomplished',
          },
        },
        required: ['summary'],
      },
    },
  },
];

// ============================================================================
// Ink Parsing Utilities (simplified for backend use)
// ============================================================================

/**
 * Parse ink file content into a simplified structure
 */
function parseInkContent(content: string): ParsedInk {
  const lines = content.split('\n');
  const knots: ParsedKnot[] = [];
  let currentKnot: ParsedKnot | null = null;
  let initialDivert: string | undefined;

  // Pattern for knot headers
  const knotHeaderPattern = /^===?\s*(\w+)\s*===?\s*$/;
  // Pattern for diverts
  const divertPattern = /->\s*(\w+)/g;
  // Pattern for choices
  const choicePattern = /^[\*\+]\s*(.+?)(?:\s*->\s*(\w+))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for knot header
    const headerMatch = trimmedLine.match(knotHeaderPattern);
    if (headerMatch) {
      // Save previous knot
      if (currentKnot) {
        currentKnot.lineEnd = i;
        knots.push(currentKnot);
      }

      // Start new knot
      currentKnot = {
        name: headerMatch[1],
        lineStart: i + 1, // 1-indexed
        lineEnd: i + 1,
        content: '',
        diverts: [],
        choices: [],
      };
      continue;
    }

    // If we're in a knot, accumulate content
    if (currentKnot) {
      currentKnot.content += line + '\n';

      // Extract diverts
      let divertMatch;
      while ((divertMatch = divertPattern.exec(trimmedLine)) !== null) {
        const target = divertMatch[1];
        if (target !== 'END' && !currentKnot.diverts.includes(target)) {
          currentKnot.diverts.push(target);
        }
      }

      // Extract choices
      const choiceMatch = trimmedLine.match(choicePattern);
      if (choiceMatch) {
        currentKnot.choices.push({
          text: choiceMatch[1].replace(/\[.*?\]/g, '').trim(),
          target: choiceMatch[2],
        });
      }
    } else {
      // Check for initial divert in preamble
      const preambleDivert = trimmedLine.match(/^->\s*(\w+)\s*$/);
      if (preambleDivert && !initialDivert) {
        initialDivert = preambleDivert[1];
      }
    }
  }

  // Save final knot
  if (currentKnot) {
    currentKnot.lineEnd = lines.length;
    knots.push(currentKnot);
  }

  return { knots, initialDivert };
}

/**
 * Build a reverse divert map (which knots lead to which)
 */
function buildReverseDivertMap(parsed: ParsedInk): Map<string, string[]> {
  const reverseMap = new Map<string, string[]>();

  // Initialize all knots with empty arrays
  for (const knot of parsed.knots) {
    reverseMap.set(knot.name, []);
  }

  // Build reverse relationships
  for (const knot of parsed.knots) {
    for (const target of knot.diverts) {
      const sources = reverseMap.get(target);
      if (sources && !sources.includes(knot.name)) {
        sources.push(knot.name);
      }
    }
  }

  // Handle initial divert
  if (parsed.initialDivert) {
    const sources = reverseMap.get(parsed.initialDivert);
    if (sources) {
      sources.unshift('START');
    }
  }

  return reverseMap;
}

/**
 * Get content preview (first non-comment, non-position line)
 */
function getContentPreview(content: string, maxLength: number = 80): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip position comments, empty lines, and other metadata
    if (
      trimmed &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('<') &&
      !trimmed.startsWith('~')
    ) {
      if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength) + '...';
      }
      return trimmed;
    }
  }
  return '(empty)';
}

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute the investigate_knot_tree tool
 */
async function executeInvestigateKnotTree(
  session: ConversationSession,
  args: { knot_name: string; depth?: number }
): Promise<ToolResult> {
  try {
    const content = await fs.readFile(session.inkFilePath, 'utf-8');
    const parsed = parseInkContent(content);
    const reverseMap = buildReverseDivertMap(parsed);

    const targetKnot = args.knot_name;
    const depth = args.depth ?? 2;

    // Check if knot exists
    if (!parsed.knots.find(k => k.name === targetKnot)) {
      return {
        success: false,
        result: '',
        error: `Knot "${targetKnot}" not found`,
      };
    }

    // Build tree backwards
    const visited = new Set<string>();
    const tree: string[] = [];

    function trace(knotName: string, currentDepth: number, indent: string): void {
      if (currentDepth > depth || visited.has(knotName)) {
        return;
      }
      visited.add(knotName);

      const sources = reverseMap.get(knotName) || [];
      if (sources.length === 0) {
        tree.push(`${indent}${knotName} (no incoming connections)`);
      } else {
        tree.push(`${indent}${knotName} <- [${sources.join(', ')}]`);
        for (const source of sources) {
          if (source !== 'START') {
            trace(source, currentDepth + 1, indent + '  ');
          }
        }
      }
    }

    trace(targetKnot, 0, '');

    return {
      success: true,
      result: `Knots leading to "${targetKnot}":\n${tree.join('\n')}`,
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to investigate knot tree: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the get_knot_content tool
 */
async function executeGetKnotContent(
  session: ConversationSession,
  args: { knot_name: string }
): Promise<ToolResult> {
  try {
    const content = await fs.readFile(session.inkFilePath, 'utf-8');
    const parsed = parseInkContent(content);

    const knot = parsed.knots.find(k => k.name === args.knot_name);
    if (!knot) {
      return {
        success: false,
        result: '',
        error: `Knot "${args.knot_name}" not found`,
      };
    }

    // Strip position comment from display
    const displayContent = knot.content
      .split('\n')
      .filter(line => !line.trim().startsWith('// <{'))
      .join('\n')
      .trim();

    return {
      success: true,
      result: `=== ${knot.name} ===\n${displayContent}\n\nDiverts to: ${knot.diverts.length > 0 ? knot.diverts.join(', ') : 'none'}\nChoices: ${knot.choices.length}`,
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to get knot content: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the list_knots tool
 */
async function executeListKnots(
  session: ConversationSession,
  args: { include_preview?: boolean }
): Promise<ToolResult> {
  try {
    const content = await fs.readFile(session.inkFilePath, 'utf-8');
    const parsed = parseInkContent(content);

    const includePreview = args.include_preview !== false;

    const lines: string[] = [];
    lines.push(`Total knots: ${parsed.knots.length}`);
    if (parsed.initialDivert) {
      lines.push(`Story starts at: ${parsed.initialDivert}`);
    }
    lines.push('');

    for (const knot of parsed.knots) {
      let line = `- ${knot.name}`;
      if (knot.choices.length > 0) {
        line += ` (${knot.choices.length} choices)`;
      }
      if (knot.diverts.length > 0) {
        line += ` -> ${knot.diverts.join(', ')}`;
      }
      if (includePreview) {
        const preview = getContentPreview(knot.content, 60);
        line += `\n    "${preview}"`;
      }
      lines.push(line);
    }

    // Also list knots created in this session
    if (session.createdKnots.length > 0) {
      lines.push('');
      lines.push(`Knots created this session: ${session.createdKnots.join(', ')}`);
    }

    return {
      success: true,
      result: lines.join('\n'),
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to list knots: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the add_knot tool
 */
async function executeAddKnot(
  session: ConversationSession,
  args: { name: string; content: string }
): Promise<ToolResult> {
  try {
    const knotName = args.name.trim();

    // Validate knot name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(knotName)) {
      return {
        success: false,
        result: '',
        error: `Invalid knot name "${knotName}". Use letters, numbers, and underscores only, starting with a letter or underscore.`,
      };
    }

    // Check for duplicates
    const content = await fs.readFile(session.inkFilePath, 'utf-8');
    const parsed = parseInkContent(content);

    if (parsed.knots.find(k => k.name === knotName)) {
      return {
        success: false,
        result: '',
        error: `Knot "${knotName}" already exists. Use modify_knot to edit it.`,
      };
    }

    if (session.createdKnots.includes(knotName)) {
      return {
        success: false,
        result: '',
        error: `Knot "${knotName}" was already created in this session.`,
      };
    }

    // Build the new knot
    const trimmedContent = args.content.trim();
    const newKnot = `\n\n=== ${knotName} ===\n${trimmedContent}\n`;

    // Append to file
    const newContent = content.trimEnd() + newKnot;
    await fs.writeFile(session.inkFilePath, newContent, 'utf-8');

    // Track the created knot
    addCreatedKnot(session.id, knotName);

    // Notify renderer about file change
    notifyFileChange(session.inkFilePath);

    return {
      success: true,
      result: `Created knot "${knotName}" with ${trimmedContent.split('\n').length} lines. The file has been saved.`,
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to add knot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the modify_knot tool
 */
async function executeModifyKnot(
  session: ConversationSession,
  args: { name: string; new_content: string }
): Promise<ToolResult> {
  try {
    const knotName = args.name.trim();

    // Read current file
    const content = await fs.readFile(session.inkFilePath, 'utf-8');
    const lines = content.split('\n');

    // Find the knot
    const parsed = parseInkContent(content);
    const knot = parsed.knots.find(k => k.name === knotName);

    if (!knot) {
      return {
        success: false,
        result: '',
        error: `Knot "${knotName}" not found. Use add_knot to create a new knot.`,
      };
    }

    // Replace the knot content (preserve header, replace body)
    const headerLine = lines[knot.lineStart - 1]; // 1-indexed
    const beforeKnot = lines.slice(0, knot.lineStart - 1);
    const afterKnot = lines.slice(knot.lineEnd);

    const newKnotLines = [headerLine, ...args.new_content.trim().split('\n')];
    const newLines = [...beforeKnot, ...newKnotLines, ...afterKnot];
    const newContent = newLines.join('\n');

    await fs.writeFile(session.inkFilePath, newContent, 'utf-8');

    // Track the modified knot
    addModifiedKnot(session.id, knotName);

    // Notify renderer about file change
    notifyFileChange(session.inkFilePath);

    return {
      success: true,
      result: `Modified knot "${knotName}". The file has been saved.`,
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to modify knot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Arguments for generate_image tool
 */
interface GenerateImageArgs {
  scene_description: string;
  shot_type?: 'portrait' | 'upper_body' | 'full_body' | 'custom';
  regions?: string[];
  include_character?: boolean;
  image_preset_name?: string;
  mood_name?: string;
  location_id?: string;
  clothing_id?: string;
  action_id?: string;
  time_weather_id?: string;
  custom_positive?: string;
  custom_negative?: string;
}

/**
 * Execute the list_image_options tool
 */
async function executeListImageOptions(
  session: ConversationSession
): Promise<ToolResult> {
  try {
    const lines: string[] = [];

    // Character information
    if (session.characterConfig) {
      lines.push('=== CHARACTER OPTIONS ===');
      lines.push('');

      // Character name from meta or characterId
      const charName = session.characterConfig.meta?.contactName || session.characterConfig.characterId;
      if (charName) {
        lines.push(`Character: ${charName}`);
      }

      // Image presets (use name as identifier)
      if (session.characterConfig.imagePromptSets && session.characterConfig.imagePromptSets.length > 0) {
        lines.push('');
        lines.push('Image Style Presets (use image_preset_name):');
        for (const preset of session.characterConfig.imagePromptSets) {
          const isDefault = preset.name === session.characterConfig.defaultImagePromptSet ? ' [DEFAULT]' : '';
          lines.push(`  - "${preset.name}"${isDefault}`);
          if (preset.positive) {
            const preview = preset.positive.length > 60 ? preset.positive.substring(0, 60) + '...' : preset.positive;
            lines.push(`      Tags: ${preview}`);
          }
        }
      }

      // Mood sets (use name as identifier)
      if (session.characterConfig.moodSets && session.characterConfig.moodSets.length > 0) {
        lines.push('');
        lines.push('Mood Sets (use mood_name):');
        for (const mood of session.characterConfig.moodSets) {
          const isDefault = mood.name === session.characterConfig.defaultMoodSet ? ' [DEFAULT]' : '';
          lines.push(`  - "${mood.name}"${isDefault}`);
          if (mood.description) {
            lines.push(`      ${mood.description}`);
          }
        }
      }

      // Character appearance info
      if (session.characterConfig.appearance) {
        lines.push('');
        lines.push('Character appearance is configured (will be included automatically)');
      }
    } else {
      lines.push('No character configuration available.');
    }

    // Prompt library (categories are lowercase enum values)
    if (session.promptLibrary && session.promptLibrary.components) {
      lines.push('');
      lines.push('=== PROMPT LIBRARY COMPONENTS ===');

      const categories = [
        { value: 'location', param: 'location_id', label: 'LOCATION' },
        { value: 'clothing', param: 'clothing_id', label: 'CLOTHING' },
        { value: 'action', param: 'action_id', label: 'ACTION' },
        { value: 'time_weather', param: 'time_weather_id', label: 'TIME_WEATHER' },
      ] as const;

      for (const { value, param, label } of categories) {
        const components = session.promptLibrary.components.filter(c => c.category === value);
        if (components.length > 0) {
          lines.push('');
          lines.push(`${label} (use ${param}):`);
          for (const comp of components) {
            lines.push(`  - "${comp.id}": ${comp.name}`);
          }
        }
      }
    } else {
      lines.push('');
      lines.push('No prompt library available.');
    }

    // Shot types info
    lines.push('');
    lines.push('=== SHOT TYPES ===');
    lines.push('  - "portrait": Head/face only (close-up)');
    lines.push('  - "upper_body": Head + torso (default for dialogue)');
    lines.push('  - "full_body": Entire character (action poses)');
    lines.push('  - "custom": Specify regions: HEAD, UPPER_BODY, LOWER_BODY, FULL_BODY');

    return {
      success: true,
      result: lines.join('\n'),
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to list image options: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the generate_image tool
 */
async function executeGenerateImage(
  session: ConversationSession,
  args: GenerateImageArgs
): Promise<ToolResult> {
  try {
    const filename = `ai_gen_${Date.now()}.png`;

    // Build detailed prompt information
    const promptInfo: string[] = [];
    const positivePrompts: string[] = [];
    const negativePrompts: string[] = [];

    // Scene description is always first
    positivePrompts.push(args.scene_description);
    promptInfo.push(`Scene: ${args.scene_description}`);

    // Shot type and regions
    const shotType = args.shot_type || 'upper_body';
    promptInfo.push(`Shot type: ${shotType}`);

    if (shotType === 'custom' && args.regions) {
      promptInfo.push(`Regions: ${args.regions.join(', ')}`);
    }

    // Determine which regions are included for negative hints
    let includedRegions: string[] = [];
    switch (shotType) {
      case 'portrait':
        includedRegions = ['HEAD'];
        break;
      case 'upper_body':
        includedRegions = ['HEAD', 'UPPER_BODY'];
        break;
      case 'full_body':
        includedRegions = ['HEAD', 'UPPER_BODY', 'LOWER_BODY', 'FULL_BODY'];
        break;
      case 'custom':
        includedRegions = args.regions || [];
        break;
    }

    // Add negative hints for excluded regions
    if (!includedRegions.includes('HEAD')) {
      negativePrompts.push('head_out_of_frame');
    }
    if (!includedRegions.includes('UPPER_BODY') && !includedRegions.includes('FULL_BODY')) {
      negativePrompts.push('upper_body');
    }
    if (!includedRegions.includes('LOWER_BODY') && !includedRegions.includes('FULL_BODY')) {
      negativePrompts.push('lower_body');
    }

    // Include character
    const includeCharacter = args.include_character !== false;
    if (!includeCharacter) {
      promptInfo.push('Character: excluded');
    } else if (session.characterConfig?.appearance) {
      promptInfo.push('Character: included (from config)');
      // In real implementation, would add character appearance prompts here
    }

    // Image preset (matched by name)
    if (args.image_preset_name && session.characterConfig?.imagePromptSets) {
      const preset = session.characterConfig.imagePromptSets.find(p => p.name === args.image_preset_name);
      if (preset) {
        promptInfo.push(`Style preset: ${preset.name}`);
        if (preset.positive) {
          positivePrompts.push(preset.positive);
        }
        if (preset.negative) {
          negativePrompts.push(preset.negative);
        }
      } else {
        promptInfo.push(`Style preset: ${args.image_preset_name} (not found)`);
      }
    }

    // Mood (matched by name)
    if (args.mood_name && session.characterConfig?.moodSets) {
      const mood = session.characterConfig.moodSets.find(m => m.name === args.mood_name);
      if (mood) {
        promptInfo.push(`Mood: ${mood.name}`);
        // Mood might add expression hints
        if (mood.description) {
          positivePrompts.push(mood.description);
        }
      } else {
        promptInfo.push(`Mood: ${args.mood_name} (not found)`);
      }
    }

    // Prompt library components (categories are lowercase enum values)
    if (session.promptLibrary?.components) {
      const componentIds = [
        { id: args.location_id, category: 'location', label: 'Location' },
        { id: args.clothing_id, category: 'clothing', label: 'Clothing' },
        { id: args.action_id, category: 'action', label: 'Action' },
        { id: args.time_weather_id, category: 'time_weather', label: 'Time/Weather' },
      ];

      for (const { id, category, label } of componentIds) {
        if (id) {
          const comp = session.promptLibrary.components.find(
            c => c.id === id && c.category === category
          );
          if (comp) {
            promptInfo.push(`${label}: ${comp.name}`);
            if (comp.positive) {
              positivePrompts.push(comp.positive);
            }
            if (comp.negative) {
              negativePrompts.push(comp.negative);
            }
          } else {
            promptInfo.push(`${label}: ${id} (not found)`);
          }
        }
      }
    }

    // Custom prompts
    if (args.custom_positive) {
      positivePrompts.push(args.custom_positive);
      promptInfo.push(`Custom positive: ${args.custom_positive}`);
    }
    if (args.custom_negative) {
      negativePrompts.push(args.custom_negative);
      promptInfo.push(`Custom negative: ${args.custom_negative}`);
    }

    // Build final prompt summary
    const inkTag = `<${filename}>`;
    const resultLines = [
      `Image generation queued. Use this tag in your knot content: ${inkTag}`,
      '',
      'Configuration:',
      ...promptInfo.map(p => `  ${p}`),
      '',
      'Final Positive Prompt:',
      `  ${positivePrompts.join(', ')}`,
    ];

    if (negativePrompts.length > 0) {
      resultLines.push('');
      resultLines.push('Final Negative Prompt:');
      resultLines.push(`  ${negativePrompts.join(', ')}`);
    }

    return {
      success: true,
      result: resultLines.join('\n'),
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute the mark_goal_complete tool
 */
async function executeMarkGoalComplete(
  session: ConversationSession,
  args: { summary: string }
): Promise<ToolResult> {
  return {
    success: true,
    result: `GOAL_COMPLETE: ${args.summary}`,
  };
}

// ============================================================================
// Tool Execution Dispatcher
// ============================================================================

/**
 * Execute a tool call
 */
export async function executeTool(
  session: ConversationSession,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  console.log(`[AITools] Executing tool: ${toolName}`, args);

  switch (toolName) {
    case 'investigate_knot_tree':
      return executeInvestigateKnotTree(session, args as { knot_name: string; depth?: number });

    case 'get_knot_content':
      return executeGetKnotContent(session, args as { knot_name: string });

    case 'list_knots':
      return executeListKnots(session, args as { include_preview?: boolean });

    case 'add_knot':
      return executeAddKnot(session, args as { name: string; content: string });

    case 'modify_knot':
      return executeModifyKnot(session, args as { name: string; new_content: string });

    case 'list_image_options':
      return executeListImageOptions(session);

    case 'generate_image':
      return executeGenerateImage(session, args as unknown as GenerateImageArgs);

    case 'mark_goal_complete':
      return executeMarkGoalComplete(session, args as { summary: string });

    default:
      return {
        success: false,
        result: '',
        error: `Unknown tool: ${toolName}`,
      };
  }
}

/**
 * Check if a tool result indicates goal completion
 */
export function isGoalComplete(result: ToolResult): boolean {
  return result.success && result.result.startsWith('GOAL_COMPLETE:');
}

/**
 * Extract goal completion summary
 */
export function getGoalCompletionSummary(result: ToolResult): string {
  if (isGoalComplete(result)) {
    return result.result.replace('GOAL_COMPLETE: ', '');
  }
  return '';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert text to a valid stitch name
 * Only allows [a-zA-Z_0-9], replaces other chars with underscore
 */
export function textToStitchName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')  // Replace non-alphanumeric with _
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')           // Trim leading/trailing underscores
    .substring(0, 30);               // Limit length
}

/**
 * Notify renderer about file changes
 */
function notifyFileChange(filePath: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('conversation:file-changed', filePath);
  }
}
