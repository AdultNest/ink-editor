/**
 * Ink Tool Provider
 *
 * Tool definitions and executors for Ink story editing.
 * Implements IToolProvider interface.
 */

import type {
    IToolProvider,
    ToolDefinition,
    ToolExecutionContext,
    ToolResult,
    ToolExecutor,
} from './interfaces';
import {readSettings} from '../../ipc/settings';
import {
    generateWithComfyUIAsync,
    getComfyUIStatusAsync,
    downloadComfyUIImageAsync,
    testComfyUIConnectionAsync,
} from '../../ipc/comfyui';
import {ollamaGenerateAsync} from '../../ipc/ollama';

// ============================================================================
// Ink Parsing Utilities
// ============================================================================

interface ParsedKnot {
    name: string;
    lineStart: number;
    lineEnd: number;
    content: string;
    diverts: string[];
    choices: Array<{ text: string; target?: string }>;
}

interface ParsedInk {
    knots: ParsedKnot[];
    initialDivert?: string;
}

/**
 * Parse ink file content into a simplified structure
 */
function parseInkContent(content: string): ParsedInk {
    const lines = content.split('\n');
    const knots: ParsedKnot[] = [];
    let currentKnot: ParsedKnot | null = null;
    let initialDivert: string | undefined;

    const knotHeaderPattern = /^===?\s*(\w+)\s*===?\s*$/;
    const divertPattern = /->\s*(\w+)/g;
    const choicePattern = /^[*+]\s*(.+?)(?:\s*->\s*(\w+))?$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        const headerMatch = trimmedLine.match(knotHeaderPattern);
        if (headerMatch) {
            if (currentKnot) {
                currentKnot.lineEnd = i;
                knots.push(currentKnot);
            }

            currentKnot = {
                name: headerMatch[1],
                lineStart: i + 1,
                lineEnd: i + 1,
                content: '',
                diverts: [],
                choices: [],
            };
            continue;
        }

        if (currentKnot) {
            currentKnot.content += line + '\n';

            let divertMatch;
            while ((divertMatch = divertPattern.exec(trimmedLine)) !== null) {
                const target = divertMatch[1];
                if (target !== 'END' && !currentKnot.diverts.includes(target)) {
                    currentKnot.diverts.push(target);
                }
            }

            const choiceMatch = trimmedLine.match(choicePattern);
            if (choiceMatch) {
                currentKnot.choices.push({
                    text: choiceMatch[1].replace(/\[.*?]/g, '').trim(),
                    target: choiceMatch[2],
                });
            }
        } else {
            const preambleDivert = trimmedLine.match(/^->\s*(\w+)\s*$/);
            if (preambleDivert && !initialDivert) {
                initialDivert = preambleDivert[1];
            }
        }
    }

    if (currentKnot) {
        currentKnot.lineEnd = lines.length;
        knots.push(currentKnot);
    }

    return {knots, initialDivert};
}

/**
 * Build a reverse divert map (which knots lead to which)
 */
function buildReverseDivertMap(parsed: ParsedInk): Map<string, string[]> {
    const reverseMap = new Map<string, string[]>();

    for (const knot of parsed.knots) {
        reverseMap.set(knot.name, []);
    }

    for (const knot of parsed.knots) {
        for (const target of knot.diverts) {
            const sources = reverseMap.get(target);
            if (sources && !sources.includes(knot.name)) {
                sources.push(knot.name);
            }
        }
    }

    if (parsed.initialDivert) {
        const sources = reverseMap.get(parsed.initialDivert);
        if (sources) {
            sources.unshift('START');
        }
    }

    return reverseMap;
}

// ============================================================================
// Structured Content Types
// ============================================================================

/**
 * Content element types for the knot content format
 * - send_message: Message sent by the player
 * - receive_message: Message received from NPC/contact
 * - send_image: Image sent by the player
 * - receive_image: Image received from NPC/contact
 * - choice: Player choice leading to another knot
 * - divert: Automatic transition to another knot
 */
type ContentElement =
    | { send_message: { text: string } }
    | { receive_message: { text: string } }
    | { send_image: { reference: string } }
    | { receive_image: { reference: string } }
    | { choice: { text: string; targetKnot: string } }
    | { divert: { targetKnot: string } };

/**
 * Knot content in the structured format
 */
interface KnotContent {
    content: ContentElement[];
}

/**
 * Parse ink knot content to the content array format
 */
function parseKnotToContent(content: string): KnotContent {
    const lines = content.split('\n');
    const contentElements: ContentElement[] = [];

    // Patterns
    const imagePattern = /^<([^>]+)>$/;
    const choiceWithTargetPattern = /^[*+]\s*\[([^\]]+)]\s*->\s*(\w+)/;
    const playerMessagePattern = /^[*+]\s*\[([^\]]+)]\s*$/;  // Choice without inline target (player message)
    const divertPattern = /^->\s*(\w+)\s*$/;
    const stitchPattern = /^=\s*\w+/;  // Stitch definition (skip these)
    const inlineStitchDivert = /^\s*->\s*\w+\.\w+/;  // Divert to stitch in same knot (skip these)

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('//')) continue;

        // Skip stitch definitions (they're part of player message flow)
        if (stitchPattern.test(trimmed)) continue;

        // Skip inline stitch diverts (they're part of player message flow)
        if (inlineStitchDivert.test(trimmed)) continue;

        // Check for image tag - treat as receive_image (NPC sending image)
        const imageMatch = trimmed.match(imagePattern);
        if (imageMatch) {
            contentElements.push({receive_image: {reference: imageMatch[1]}});
            continue;
        }

        // Check for choice with explicit target (real branching choice)
        const choiceWithTargetMatch = trimmed.match(choiceWithTargetPattern);
        if (choiceWithTargetMatch) {
            contentElements.push({choice: {text: choiceWithTargetMatch[1], targetKnot: choiceWithTargetMatch[2]}});
            continue;
        }

        // Check for player message (choice without inline target, followed by stitch divert)
        const playerMessageMatch = trimmed.match(playerMessagePattern);
        if (playerMessageMatch) {
            contentElements.push({send_message: {text: playerMessageMatch[1]}});
            continue;
        }

        // Check for standalone divert
        const divertMatch = trimmed.match(divertPattern);
        if (divertMatch) {
            contentElements.push({divert: {targetKnot: divertMatch[1]}});
            continue;
        }

        // Otherwise treat as received message (if not empty and not a variable/function)
        if (trimmed && !trimmed.startsWith('~') && !trimmed.startsWith('VAR')) {
            contentElements.push({receive_message: {text: trimmed}});
        }
    }

    return {content: contentElements};
}

function trimSpecialCharacters(input: string, trimChars: string): string {
    let startIndex = 0;
    let endIndex = input.length - 1;
    for (let i = 0; i < input.length; i++) {
        let c = input[i];
        if (trimChars.includes(c)) {
            startIndex++;
        } else {
            break;
        }
    }
    for (let i = endIndex; i >= 0; i--) {
        let c = input[i];
        if (trimChars.includes(c)) {
            endIndex = i;
        } else {
            break;
        }
    }
    if (endIndex <= startIndex) {
        return '';
    }
    if (startIndex == 0 && endIndex == input.length - 1) {
        return input;
    }
    return input.substring(startIndex, endIndex + 1);
}

function removeKnownFileExtension(input: string): string {
    let knownExtensions = [
        ".png",
        ".jpg",
        ".jpeg",
        ".mp4",
        ".webm",
        ".mpeg",
        ".gif"
    ];
    for (const knownExtension of knownExtensions) {
        if (input.indexOf(knownExtension) !== -1) {
            return input.substring(knownExtension.length, knownExtension.length - 1);
        }
    }
    return input;
}

/**
 * Convert content array format to ink format
 */
function convertContentToInk(knotName: string, content: ContentElement[]): string {
    const lines: string[] = [];
    const choices: Array<{ text: string; targetKnot: string }> = [];
    let finalDivert: string | null = null;

    let trimCharacters = " []*<>.!+\t\r\n";

    try {

        for (const element of content) {
            if ('send_message' in element && element.send_message?.text) {
                // Player sends a message - rendered as ink choice with immediate stitch continuation
                let stitchId = `stitch_${lines.length}_${Date.now().toString()}`;
                lines.push(`* [${trimSpecialCharacters(element.send_message.text, trimCharacters)}]`);
                lines.push(`    -> ${knotName}.${stitchId}`);
                lines.push(`= ${stitchId}`);
            } else if ('receive_message' in element && element.receive_message?.text) {
                // Player receives a message from NPC - rendered as plain text
                lines.push(trimSpecialCharacters(element.receive_message.text, trimCharacters));
            } else if ('send_image' in element) {
                // Player sends an image - rendered as choice with image tag in stitch
                let stitchId = `stitch_${lines.length}_${Date.now().toString()}`;
                const imageRef = removeKnownFileExtension(trimSpecialCharacters(element.send_image.reference, trimCharacters));
                lines.push(`* [Send image]`);
                lines.push(`    -> ${knotName}.${stitchId}`);
                lines.push(`= ${stitchId}`);
                lines.push(`<${imageRef}>`);
            } else if ('receive_image' in element) {
                // Player receives an image from NPC - rendered as plain image tag
                lines.push(`<${removeKnownFileExtension(trimSpecialCharacters(element.receive_image.reference, trimCharacters))}>`);
            } else if ('choice' in element) {
                choices.push({
                    text: trimSpecialCharacters(element.choice.text, trimCharacters),
                    targetKnot: trimSpecialCharacters(element.choice.targetKnot, trimCharacters)
                });
            } else if ('divert' in element) {
                finalDivert = trimSpecialCharacters(element.divert.targetKnot, trimCharacters);
            }
        }
    } catch (ex) {
        console.log(ex);
        return '';
    }

    // Add blank line before choices/divert if we have content
    if (lines.length > 0 && (choices.length > 0 || finalDivert)) {
        lines.push('');
    }

    // Add choices
    if (choices.length > 0) {
        for (const choice of choices) {
            lines.push(`* [${choice.text}] -> ${choice.targetKnot}`);
        }
    } else if (finalDivert) {
        // No choices but has divert
        lines.push(`-> ${finalDivert}`);
    }

    return lines.join('\n').trim();
}

// ============================================================================
// Message Length Validation
// ============================================================================

/**
 * Extract messages from content array for validation
 */
function extractMessagesForValidation(content: ContentElement[]): string[] {
    const messages: string[] = [];
    for (const element of content) {
        if ('send_message' in element && element.send_message?.text) {
            const text = element.send_message.text;
            messages.push(`"${text}" (${text.length} characters)`);
        } else if ('receive_message' in element && element.receive_message?.text) {
            const text = element.receive_message.text;
            messages.push(`"${text}" (${text.length} characters)`);
        }
    }
    return messages;
}

/**
 * Validate message lengths using LLM
 * Returns { valid: true } if messages pass, or { valid: false, feedback: string } if they fail
 */
async function validateMessageLengths(
    content: ContentElement[],
    ollamaBaseUrl: string,
    ollamaModel: string
): Promise<{ valid: boolean; feedback?: string }> {
    const messages = extractMessagesForValidation(content);

    // If no messages to validate, pass
    if (messages.length === 0) {
        return {valid: true};
    }

    const prompt = `Check whether the following messages are short enough and separated appropriately for a WhatsApp chat or SMS. Consider messages under 40 characters as ideal (like typical quick messages). Look for messages containing multiple distinct thoughts or pieces of information, as they might be better split. Output either Yes or No.
If you output No, explain whether the issue is due to a message being too long (exceeding the ideal length, even if under 100 characters) or due to messages not being split enough (e.g., combining a greeting with the main point, or having one message contain multiple distinct thoughts). Suggest how the user could split the messages for a more natural chat/SMS appearance.
If a message is just "acceptable" but could be split, always output no.

Messages to check:
${messages.join('\n')}`;

    try {
        const response = await ollamaGenerateAsync({
            baseUrl: ollamaBaseUrl,
            model: ollamaModel,
            prompt,
            options: {
                temperature: 0.3, // Lower temperature for more consistent validation
                maxTokens: 1024,
            },
        }, 30000); // 30 second timeout for validation

        if (!response.success || !response.response) {
            // If validation fails, allow the edit to proceed (don't block on validation errors)
            console.warn('[MessageValidation] LLM validation failed, allowing edit to proceed');
            return {valid: true};
        }

        const result = response.response.trim();

        // Check if the response starts with "Yes"
        if (result.toLowerCase().startsWith('yes')) {
            return {valid: true};
        }

        // Response starts with "No" - extract the feedback
        // Remove the "No" prefix and any trailing period/punctuation
        let feedback = result;
        if (feedback.toLowerCase().startsWith('no')) {
            feedback = feedback.substring(2).trim();
            // Remove leading period or punctuation
            if (feedback.startsWith('.') || feedback.startsWith(',') || feedback.startsWith(':')) {
                feedback = feedback.substring(1).trim();
            }
        }

        return {valid: false, feedback};
    } catch (error) {
        // On error, allow the edit to proceed
        console.warn('[MessageValidation] LLM validation error:', error);
        return {valid: true};
    }
}

// ============================================================================
// Tool Registration Types
// ============================================================================

interface ToolRegistration {
    definition: ToolDefinition;
    executor: ToolExecutor;
    countsTowardsIteration: boolean;
}

// ============================================================================
// Image Prompt Builder - Uses PromptBuilderService from renderer
// ============================================================================

import {
    PromptRegion,
    CharacterAppearance,
    DEFAULT_QUALITY_TAGS,
    DEFAULT_NEGATIVE_TAGS,
    EXTENDED_SHOT_REGION_MAP,
} from '../../../shared/promptData';
import {PromptBuilderService} from '../../../renderer/services/promptBuilder';

// Create a local instance for the main process
const promptBuilder = new PromptBuilderService();

interface BuildImagePromptOptions {
    characterConfig?: Record<string, unknown>;
    includeCharacter: boolean;
    shotType: string;
    regions?: string[];
    sceneDescription?: string;
    imagePresetName?: string;
    moodSetName?: string;
    promptLibrary?: Record<string, unknown>;
    promptComponents?: string[];
    customPositive?: string;
    customNegative?: string;
}

function buildImagePrompt(options: BuildImagePromptOptions): { positive: string; negative: string } {
    const positiveParts: string[] = [];
    const negativeParts: string[] = [];

    // Determine which regions to include based on shot type
    let includedRegions: PromptRegion[];
    if (options.shotType === 'custom' && options.regions?.length) {
        includedRegions = options.regions as PromptRegion[];
    } else {
        includedRegions = EXTENDED_SHOT_REGION_MAP[options.shotType] || EXTENDED_SHOT_REGION_MAP.full_body;
    }

    // Build character appearance prompt using PromptBuilderService
    if (options.includeCharacter && options.characterConfig) {
        const appearance = options.characterConfig.appearance as CharacterAppearance | undefined;
        if (appearance) {
            // Use promptBuilder to generate the appearance-based prompt with regional filtering
            const appearancePrompt = promptBuilder.buildRegionalPromptWithRegions(
                appearance,
                includedRegions
            );
            if (appearancePrompt.positive) positiveParts.push(appearancePrompt.positive);
            if (appearancePrompt.negative) negativeParts.push(appearancePrompt.negative);
        } else {
            // No appearance defined, use defaults
            positiveParts.push(...DEFAULT_QUALITY_TAGS);
            negativeParts.push(...DEFAULT_NEGATIVE_TAGS);
        }
    } else {
        // Scenery mode - just quality tags
        positiveParts.push(...DEFAULT_QUALITY_TAGS);
        negativeParts.push(...DEFAULT_NEGATIVE_TAGS);
    }

    // Image style (from prompt library's image_style category)
    if (options.imagePresetName && options.promptLibrary?.components) {
        const components = options.promptLibrary.components as Array<{
            id: string;
            category: string;
            positive?: string;
            negative?: string
        }>;
        const style = components.find(c => c.category === 'image_style' && c.id === options.imagePresetName);
        if (style?.positive) positiveParts.push(style.positive);
        if (style?.negative) negativeParts.push(style.negative);
    }

    // Mood (from prompt library's mood category - adds visual prompts)
    if (options.moodSetName && options.promptLibrary?.components) {
        const components = options.promptLibrary.components as Array<{
            id: string;
            category: string;
            positive?: string;
            negative?: string
        }>;
        const mood = components.find(c => c.category === 'mood' && c.id === options.moodSetName);
        if (mood?.positive) positiveParts.push(mood.positive);
        if (mood?.negative) negativeParts.push(mood.negative);
    }

    // Prompt library components
    if (options.promptComponents?.length && options.promptLibrary?.components) {
        const components = options.promptLibrary.components as Array<{
            id: string;
            positive?: string;
            negative?: string
        }>;
        for (const compId of options.promptComponents) {
            const comp = components.find(c => c.id === compId);
            if (comp) {
                if (comp.positive) positiveParts.push(comp.positive);
                if (comp.negative) negativeParts.push(comp.negative);
            }
        }
    }

    // Scene description
    if (options.sceneDescription) positiveParts.push(options.sceneDescription);

    // Custom prompts
    if (options.customPositive) positiveParts.push(options.customPositive);
    if (options.customNegative) negativeParts.push(options.customNegative);

    return {
        positive: positiveParts.filter(Boolean).join(', '),
        negative: negativeParts.filter(Boolean).join(', ')
    };
}

// ============================================================================
// Tool Definitions with Executors
// ============================================================================

const TOOLS: ToolRegistration[] = [
    // -------------------------------------------------------------------------
    // knot_format - Documentation for knot content format
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'knot_format',
                description: 'Get detailed documentation on how to format knot content. Call this before creating or modifying knots.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
        executor: async () => {
            const formatDoc = `## Knot Content Format

A knot has a name and a content array. Each element is ONE of these types:

\`\`\`json
{
  "name": "knot_name",
  "content": [
    { "send_message": { "text": "string" } },
    { "receive_message": { "text": "string" } },
    { "send_image": { "reference": "string" } },
    { "receive_image": { "reference": "string" } },
    { "choice": { "text": "string", "targetKnot": "string" } },
    { "divert": { "targetKnot": "string" } }
  ]
}
\`\`\`

### Element Types

1. **send_message** - Player sends a message
   - text: Short chat message (single words to very, very short sentences; If in doubt, break up a sentence)

2. **receive_message** - Player receives a message from NPC/contact
   - text: Short chat message (single words to very, very short sentences; If in doubt, break up a sentence)

3. **send_image** - Player sends an image
   - reference: The image filename

4. **receive_image** - Player receives an image from NPC/contact
   - reference: The image filename

5. **choice** - Player option (leads to another knot)
   - text: What player sees
   - targetKnot: Knot to go to when chosen

6. **divert** - Automatic transition
   - targetKnot: Knot to go to (use "END" to end story)

### Example

\`\`\`json
{
  "name": "coffee_shop",
  "content": [
    { "receive_message": { "text": "Hey!" } },
    { "receive_message": { "text": "You made it :)" } },
    { "receive_message": { "text": "Want a coffee?" } },
    { "receive_image": { "reference": "coffee_shop" } },
    { "send_message": { "text": "Sure, I'd love one!" } },
    { "choice": { "text": "Order latte", "targetKnot": "order_latte" } },
    { "choice": { "text": "Order espresso", "targetKnot": "order_espresso" } }
  ]
}
\`\`\`

### Rules
1. Messages MUST be VERY SHORT like chat messages, try to avoid gramatically full sentences.
2. Split long messages into multiple messages
3. End with choices OR a divert
4. Use "END" as targetKnot to end conversation
5. Choices must point to existing or planned knots
5. Generate images first using a tool, only then use knot modifying tools
6. Never include narration in messages, use emojis to express feelings`;

            return {success: true, result: formatDoc};
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // investigate_knot_tree - Trace backwards through story
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'investigate_knot_tree',
                description: 'Trace backwards through the story to see what knots lead to a specific knot.',
                parameters: {
                    type: 'object',
                    properties: {
                        knot_name: {
                            type: 'string',
                            description: 'The name of the knot to investigate',
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
        executor: async (context, args) => {
            try {
                const content = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInkContent(content);
                const reverseMap = buildReverseDivertMap(parsed);

                const targetKnot = args.knot_name as string;
                const depth = (args.depth as number) ?? 2;

                if (!parsed.knots.find(k => k.name === targetKnot)) {
                    return {success: false, result: '', error: `Knot "${targetKnot}" not found`};
                }

                const visited = new Set<string>();
                const tree: string[] = [];

                const trace = (knotName: string, currentDepth: number, indent: string): void => {
                    if (currentDepth > depth || visited.has(knotName)) return;
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
                };

                trace(targetKnot, 0, '');
                return {success: true, result: `Knots leading to "${targetKnot}":\n${tree.join('\n')}`};
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // get_knot_content - Read a knot's content as structured JSON
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_knot_content',
                description: 'Read a knot\'s content as structured JSON. Returns content array with send_message, receive_message, send_image, receive_image, choice, divert elements.',
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
        executor: async (context, args) => {
            try {
                const content = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInkContent(content);
                const knot = parsed.knots.find(k => k.name === args.knot_name);

                if (!knot) {
                    return {
                        success: false,
                        result: '',
                        error: `Knot "${args.knot_name}" not found. Use list_knots to see available knots.`
                    };
                }

                // Parse the raw content into structured format
                const knotContent = parseKnotToContent(knot.content);

                // Return as JSON so the LLM can easily understand and modify it
                const result = {
                    name: knot.name,
                    ...knotContent,
                };

                return {
                    success: true,
                    result: JSON.stringify(result, null, 2),
                };
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // list_knots - List all knots in the story
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'list_knots',
                description: 'List all knots in the story with their connections (outlinks). Use get_knot_content to read a specific knot.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
        executor: async (context) => {
            try {
                const content = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInkContent(content);

                const lines: string[] = [];

                // Handle empty story case
                if (parsed.knots.length === 0) {
                    lines.push('The story is empty (no knots yet).');
                    lines.push('');
                    lines.push('Use add_knot to create the first knot (typically named "start").');
                    return {success: true, result: lines.join('\n')};
                }

                lines.push(`Total knots: ${parsed.knots.length}`);
                if (parsed.initialDivert) {
                    lines.push(`Story starts at: ${parsed.initialDivert}`);
                }
                lines.push('');

                for (const knot of parsed.knots) {
                    let line = `- ${knot.name}`;
                    // Show outlinks (what this knot connects to)
                    const outlinks = Array.from(new Set([...knot.diverts, ...knot.choices.map(c => c.target).filter(Boolean)]));
                    if (outlinks.length > 0) {
                        line += ` -> ${outlinks.join(', ')}`;
                    } else {
                        line += ' (no outlinks)';
                    }
                    lines.push(line);
                }

                lines.push('');
                lines.push('Use get_knot_content to read a specific knot.');

                return {success: true, result: lines.join('\n')};
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // add_knot - Create a new knot
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'add_knot',
                description: 'Create a new knot (scene). Use content array format. Call knot_format first if unsure about format.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Knot name in snake_case (e.g. "start", "coffee_shop")',
                        },
                        content: {
                            type: 'array',
                            description: 'Array of content elements: send_message, receive_message, send_image, receive_image, choice, or divert objects',
                            items: {type: 'object'},
                        },
                    },
                    required: ['name', 'content'],
                },
            },
        },
        executor: async (context, args) => {
            try {
                const knotName = (args.name as string).trim();

                if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(knotName)) {
                    return {
                        success: false,
                        result: '',
                        error: `Invalid knot name "${knotName}". Use snake_case (letters, numbers, underscores).`
                    };
                }

                const fileContent = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInkContent(fileContent);

                if (parsed.knots.find(k => k.name === knotName)) {
                    return {
                        success: false,
                        result: '',
                        error: `Knot "${knotName}" already exists. Use modify_knot tool to edit it.`
                    };
                }

                if (!args.content || !Array.isArray(args.content)) {
                    return {
                        success: false,
                        result: '',
                        error: 'No content provided. Use the knot_format tool to discover the correct format.'
                    };
                }

                const contentArray = args.content as ContentElement[];
                const inkContent = convertContentToInk(knotName, contentArray);

                // Count elements for summary
                let messageCount = 0;
                let choiceCount = 0;
                let divertTarget: string | null = null;

                for (const element of contentArray) {
                    if ('send_message' in element || 'receive_message' in element) messageCount++;
                    else if ('choice' in element) choiceCount++;
                    else if ('divert' in element) divertTarget = element.divert.targetKnot;
                }

                if (!inkContent) {
                    return {
                        success: false,
                        result: '',
                        error: 'Invalid format. Use the knot_format tool to discover the correct format.'
                    };
                }

                // Validate message lengths using LLM
                const settings = await readSettings();
                if (settings.ollama?.enabled && settings.ollama.baseUrl && settings.ollama.model) {
                    const validation = await validateMessageLengths(
                        contentArray,
                        settings.ollama.baseUrl,
                        settings.ollama.model
                    );

                    if (!validation.valid) {
                        return {
                            success: false,
                            result: '',
                            error: `Message length validation failed. The messages you generated are too long or not split enough for a natural chat/SMS appearance.\n\n${validation.feedback}\n\nPlease split longer messages into shorter, more natural chat-style messages and try using add_knot again.`
                        };
                    }
                }

                const newKnot = `\n\n=== ${knotName} ===\n${inkContent}\n`;
                const newFileContent = fileContent.trimEnd() + newKnot;

                // Write to staging file service (keeps content in memory + notifies frontend)
                // User decides when to persist to disk
                await context.fileService.writeFile(context.inkFilePath, newFileContent);

                // Build summary
                let summary = `Created knot "${knotName}" with ${messageCount} message(s)`;
                if (choiceCount > 0) {
                    summary += ` and ${choiceCount} choice(s)`;
                }
                if (divertTarget) {
                    summary += ` (diverts to ${divertTarget})`;
                }

                return {success: true, result: summary};
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: true,
    },

    // -------------------------------------------------------------------------
    // modify_knot - Replace an existing knot with new content
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'modify_knot',
                description: 'Replace an existing knot with new content. Use content array format.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The name of the knot to modify',
                        },
                        content: {
                            type: 'array',
                            description: 'Array of content elements: send_message, receive_message, send_image, receive_image, choice, or divert objects',
                            items: {type: 'object'},
                        },
                    },
                    required: ['name', 'content'],
                },
            },
        },
        executor: async (context, args) => {
            try {
                const knotName = (args.name as string).trim();
                const fileContent = await context.fileService.readFile(context.inkFilePath);
                const lines = fileContent.split('\n');
                const parsed = parseInkContent(fileContent);
                const knot = parsed.knots.find(k => k.name === knotName);

                if (!knot) {
                    return {
                        success: false,
                        result: '',
                        error: `Knot "${knotName}" not found. Use list_knots to see available knots.`
                    };
                }

                if (!args.content || !Array.isArray(args.content)) {
                    return {
                        success: false,
                        result: '',
                        error: 'No content provided. Use the knot_format tool to discover the correct format.'
                    };
                }

                const contentArray = args.content as ContentElement[];
                const inkContent = convertContentToInk(knotName, contentArray);

                // Count elements for summary
                let messageCount = 0;
                let choiceCount = 0;

                for (const element of contentArray) {
                    if ('send_message' in element || 'receive_message' in element) messageCount++;
                    else if ('choice' in element) choiceCount++;
                }

                if (!inkContent) {
                    return {
                        success: false,
                        result: '',
                        error: 'Invalid format. Use the knot_format tool to discover the correct format.'
                    };
                }

                // Validate message lengths using LLM
                const settings = await readSettings();
                if (settings.ollama?.enabled && settings.ollama.baseUrl && settings.ollama.model) {
                    const validation = await validateMessageLengths(
                        contentArray,
                        settings.ollama.baseUrl,
                        settings.ollama.model
                    );

                    if (!validation.valid) {
                        return {
                            success: false,
                            result: '',
                            error: `Message length validation failed. The messages you generated are too long or not split enough for a natural chat/SMS appearance.\n\n${validation.feedback}\n\nPlease split longer messages into shorter, more natural chat-style messages and try using modify_knot again.`
                        };
                    }
                }

                const headerLine = lines[knot.lineStart - 1];
                const beforeKnot = lines.slice(0, knot.lineStart - 1);
                const afterKnot = lines.slice(knot.lineEnd);
                const newKnotLines = [headerLine, ...inkContent.split('\n')];
                const newFileContent = [...beforeKnot, ...newKnotLines, ...afterKnot].join('\n');

                // Write to staging file service (keeps content in memory + notifies frontend)
                // User decides when to persist to disk
                await context.fileService.writeFile(context.inkFilePath, newFileContent);

                // Build summary
                let summary = `Modified knot "${knotName}" - now has ${messageCount} message(s)`;
                if (choiceCount > 0) {
                    summary += ` and ${choiceCount} choice(s)`;
                }

                return {success: true, result: summary};
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: true,
    },

    // -------------------------------------------------------------------------
    // get_generation_capabilities - Get available image generation capabilities
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'get_generation_capabilities',
                description: 'Get available character presets and prompt library options. Call this FIRST before generating images. ALWAYS use presets when available.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
        executor: async (context) => {
            const contactConfig = context.data?.contactCharacterConfig || context.data?.characterConfig;
            const playerConfig = context.data?.playerCharacterConfig;
            const promptLibrary = context.data?.promptLibrary as Record<string, unknown> | undefined;

            type CharConfig = {
                meta?: { contactName?: string };
                characterId?: string;
                defaultImageStyleId?: string;
                defaultMoodId?: string;
            };

            // Extract library components by category
            const components = (promptLibrary?.components as Array<{
                id: string;
                name: string;
                category: string;
                description?: string;
            }>) || [];

            const imageStyles = components.filter(c => c.category === 'image_style').map(c => c.id);
            const moods = components.filter(c => c.category === 'mood').map(c => ({id: c.id, name: c.name}));

            const capabilities = {
                characters: {
                    contact: contactConfig ? {
                        name: (contactConfig as CharConfig).meta?.contactName || (contactConfig as CharConfig).characterId,
                        defaultImageStyle: (contactConfig as CharConfig).defaultImageStyleId || null,
                        defaultMood: (contactConfig as CharConfig).defaultMoodId || null,
                    } : null,
                    player: playerConfig ? {
                        name: (playerConfig as CharConfig).meta?.contactName || 'Player',
                        defaultImageStyle: (playerConfig as CharConfig).defaultImageStyleId || null,
                        defaultMood: (playerConfig as CharConfig).defaultMoodId || null,
                    } : null,
                },
                promptLibrary: {
                    imageStyles,
                    moods: moods.map(m => m.id),
                    locations: components.filter(c => c.category === 'location').map(c => c.id),
                    clothing: components.filter(c => c.category === 'clothing').map(c => c.id),
                    actions: components.filter(c => c.category === 'action').map(c => c.id),
                    timeWeather: components.filter(c => c.category === 'time_weather').map(c => c.id),
                },
                shotTypes: {
                    portrait: 'Head/face shot (includes general attributes like gender, body type)',
                    upper_body: 'Head + torso (includes head + upper body + general attributes)',
                    lower_body: 'Lower body, no face (includes lower body + general attributes)',
                    full_body: 'Entire character (all body regions)',
                    custom: 'Specify regions array: head, upper_body, lower_body, full_body',
                },
                promptGuidelines: 'ALWAYS use image_preset_name (from promptLibrary.imageStyles) + mood_set_name (from promptLibrary.moods) when available. Use prompt_components for location/clothing/action/time_weather. scene_description should be simple words: "sitting", "smiling" - NOT sentences. Only use custom_positive/custom_negative when no suitable preset/components exist.',
            };

            return {success: true, result: JSON.stringify(capabilities, null, 2)};
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // list_image_options - List available image generation options
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'list_image_options',
                description: 'List available image generation options.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
        executor: async (context) => {
            const lines: string[] = [];
            // Contact character
            const contactConfig = (context.data?.contactCharacterConfig || context.data?.characterConfig) as Record<string, unknown> | undefined;
            // Player character
            const playerConfig = context.data?.playerCharacterConfig as Record<string, unknown> | undefined;
            const promptLibrary = context.data?.promptLibrary as Record<string, unknown> | undefined;

            const components = (promptLibrary?.components as Array<{
                id: string;
                name: string;
                category: string;
                description?: string;
            }>) ?? [];

            // Show contact character options
            if (contactConfig) {
                lines.push('=== CONTACT CHARACTER OPTIONS ===');
                const charName = (contactConfig.meta as Record<string, unknown>)?.contactName || contactConfig.characterId;
                if (charName) lines.push(`Character: ${charName}`);
                const defaultStyle = contactConfig.defaultImageStyleId as string | undefined;
                const defaultMood = contactConfig.defaultMoodId as string | undefined;
                if (defaultStyle) lines.push(`Default Image Style: ${defaultStyle}`);
                if (defaultMood) lines.push(`Default Mood: ${defaultMood}`);
            } else {
                lines.push('No contact character configuration available.');
            }

            // Show player character options
            if (playerConfig) {
                lines.push('', '=== PLAYER CHARACTER OPTIONS ===');
                const charName = (playerConfig.meta as Record<string, unknown>)?.contactName || playerConfig.characterId || 'Player';
                if (charName) lines.push(`Character: ${charName}`);
                const defaultStyle = playerConfig.defaultImageStyleId as string | undefined;
                const defaultMood = playerConfig.defaultMoodId as string | undefined;
                if (defaultStyle) lines.push(`Default Image Style: ${defaultStyle}`);
                if (defaultMood) lines.push(`Default Mood: ${defaultMood}`);
            }

            // Image styles from library
            const imageStyles = components.filter(c => c.category === 'image_style');
            if (imageStyles.length) {
                lines.push('', '=== IMAGE STYLES (from Prompt Library) ===');
                for (const style of imageStyles) {
                    lines.push(`  - "${style.id}": ${style.name}`);
                }
            }

            // Moods from library
            const moods = components.filter(c => c.category === 'mood');
            if (moods.length) {
                lines.push('', '=== MOODS (from Prompt Library) ===');
                for (const mood of moods) {
                    lines.push(`  - "${mood.id}": ${mood.name}${mood.description ? ` - ${mood.description}` : ''}`);
                }
            }

            // Other prompt library components
            const categories = ['location', 'clothing', 'action', 'time_weather'];
            const hasOtherComponents = categories.some(cat => components.some(c => c.category === cat));
            if (hasOtherComponents) {
                lines.push('', '=== PROMPT LIBRARY COMPONENTS ===');
                for (const cat of categories) {
                    const catComponents = components.filter(c => c.category === cat);
                    if (catComponents.length) {
                        lines.push('', `${cat.toUpperCase()}:`);
                        for (const comp of catComponents) {
                            lines.push(`  - "${comp.id}": ${comp.name}`);
                        }
                    }
                }
            }

            lines.push('', '=== SHOT TYPES ===');
            lines.push('  - "portrait": Head/face (includes general body attributes)');
            lines.push('  - "upper_body": Head + torso (includes general body attributes)');
            lines.push('  - "lower_body": Lower body only, no face (includes general body attributes)');
            lines.push('  - "full_body": Entire character');
            lines.push('  - "custom": Specify regions: head, upper_body, lower_body, full_body');

            return {success: true, result: lines.join('\n')};
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // generate_image - Generate an image for a scene
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'generate_image',
                description: 'Generate an image. Call get_generation_capabilities first to see available presets. ALWAYS use image_preset_name when a suitable preset exists. Returns ink tag.',
                parameters: {
                    type: 'object',
                    properties: {
                        character_subject: {
                            type: 'string',
                            enum: ['player', 'contact', 'none'],
                            description: 'Whose image: "player" (user), "contact" (NPC), or "none" (scenery only, no character)',
                        },
                        shot_type: {
                            type: 'string',
                            description: 'Shot framing. Determines which character attributes to include.',
                            enum: ['portrait', 'upper_body', 'lower_body', 'full_body', 'custom'],
                        },
                        regions: {
                            type: 'array',
                            description: 'For custom shot_type only: regions to include (head, upper_body, lower_body, full_body)',
                            items: {type: 'string'},
                        },
                        image_preset_name: {
                            type: 'string',
                            description: 'REQUIRED when presets available. Character style preset from get_generation_capabilities.',
                        },
                        mood_set_name: {
                            type: 'string',
                            description: 'Character mood from get_generation_capabilities. Adds emotional context.',
                        },
                        prompt_components: {
                            type: 'array',
                            description: 'Prompt library component IDs from get_generation_capabilities (location, clothing, action, time_weather).',
                            items: {type: 'string'},
                        },
                        scene_description: {
                            type: 'string',
                            description: 'Simple words for pose/action: "sitting", "smiling", "looking away" - NOT full sentences.',
                        },
                        custom_positive: {
                            type: 'string',
                            description: 'ONLY when no suitable preset/components exist. Additional positive tags.',
                        },
                        custom_negative: {
                            type: 'string',
                            description: 'ONLY when needed. Additional negative tags.',
                        },
                    },
                    required: ['character_subject', 'shot_type'],
                },
            },
        },
        executor: async (context, args) => {
            const timestamp = Date.now();
            const filename = `ai_gen_${timestamp}.png`;
            const inkTag = `<${filename}>`;

            // Get settings
            const settings = await readSettings();
            const comfyui = settings.comfyui;

            // Check if ComfyUI is available
            if (!comfyui?.enabled || !comfyui?.baseUrl || !comfyui?.checkpointModel) {
                const fallback = `placeholder_${new Date().toISOString().split('T')[0]}.png`;
                return {success: true, result: `ComfyUI disabled. Placeholder: <${fallback}>`};
            }

            // Test connection
            const connTest = await testComfyUIConnectionAsync(comfyui.baseUrl);
            if (!connTest.success) {
                const fallback = `placeholder_${new Date().toISOString().split('T')[0]}.png`;
                return {success: true, result: `ComfyUI unreachable: ${connTest.error}. Placeholder: <${fallback}>`};
            }

            // Get character config based on subject
            const subject = (args.character_subject as string) || 'contact';
            const includeCharacter = subject !== 'none';
            let charConfig: Record<string, unknown> | null = null;
            if (subject === 'player') {
                charConfig = context.data?.playerCharacterConfig as Record<string, unknown> | null;
            } else if (subject === 'contact') {
                charConfig = (context.data?.contactCharacterConfig || context.data?.characterConfig) as Record<string, unknown> | null;
            }

            // Build prompt
            const {positive, negative} = buildImagePrompt({
                characterConfig: charConfig || undefined,
                includeCharacter,
                shotType: (args.shot_type as string) || 'upper_body',
                regions: args.regions as string[],
                sceneDescription: args.scene_description as string,
                imagePresetName: args.image_preset_name as string,
                moodSetName: args.mood_set_name as string,
                promptLibrary: context.data?.promptLibrary as Record<string, unknown> | undefined,
                promptComponents: args.prompt_components as string[],
                customPositive: args.custom_positive as string,
                customNegative: args.custom_negative as string,
            });

            // Queue generation
            const genResult = await generateWithComfyUIAsync({
                baseUrl: comfyui.baseUrl,
                prompt: positive,
                negativePrompt: negative,
                checkpointModel: comfyui.checkpointModel,
                steps: comfyui.defaultSteps || 20,
                width: comfyui.defaultWidth || 512,
                height: comfyui.defaultHeight || 512,
                projectPath: context.projectPath,
                workflowType: 'render',
            });

            if (!genResult.success || !genResult.promptId) {
                return {success: false, result: '', error: `Queue failed: ${genResult.error}`};
            }

            // Poll for completion (max 120s)
            const startTime = Date.now();
            while (Date.now() - startTime < 120000) {
                const status = await getComfyUIStatusAsync(comfyui.baseUrl, genResult.promptId);

                if (status.status === 'completed' && status.imageFilename) {
                    const sep = context.projectPath.includes('\\') ? '\\' : '/';
                    const destFolder = `${context.projectPath}${sep}Images`;

                    const dl = await downloadComfyUIImageAsync(
                        comfyui.baseUrl, status.imageFilename, destFolder, filename
                    );

                    if (dl.success) {
                        return {success: true, result: `Image generated: ${inkTag}`};
                    }
                    return {success: false, result: '', error: `Download failed: ${dl.error}`};
                }

                if (status.status === 'error') {
                    return {success: false, result: '', error: `Generation failed: ${status.error}`};
                }

                await new Promise(r => setTimeout(r, 1000));
            }

            return {success: false, result: '', error: 'Generation timed out (120s)'};
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // validate - Validate the ink story for errors
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'validate',
                description: 'Validate the ink story for errors like dangling references (knots that are referenced but do not exist) and missing images. Returns a list of errors and warnings.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
        executor: async (context) => {
            try {
                // Import the parser and media validation functions
                const {parseInk} = await import('../../../renderer/ink/parser/inkParser');
                const {
                    extractMediaReferences,
                    validateMediaReferences
                } = await import('../../../renderer/ink/parser/mediaValidator');

                const content = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInk(content);

                // Start with parser errors (filter out media errors as we'll handle those separately)
                let allErrors = parsed.errors.filter(err => err.category !== 'media');

                // Check if ComfyUI is enabled for media validation
                const settings = await readSettings();
                const comfyUIEnabled = settings.comfyui?.enabled ?? false;

                if (comfyUIEnabled) {
                    // Get available media files from Images and Videos folders
                    const sep = context.projectPath.includes('\\') ? '\\' : '/';
                    const imagesFolder = `${context.projectPath}${sep}Images`;
                    const videosFolder = `${context.projectPath}${sep}Videos`;

                    const availableImages = new Set<string>();
                    const availableVideos = new Set<string>();

                    try {
                        const fs = await import('fs/promises');
                        const imageFiles = await fs.readdir(imagesFolder);
                        for (const file of imageFiles) {
                            availableImages.add(file);
                        }
                    } catch {
                        // Images folder doesn't exist or can't be read
                    }

                    try {
                        const fs = await import('fs/promises');
                        const videoFiles = await fs.readdir(videosFolder);
                        for (const file of videoFiles) {
                            availableVideos.add(file);
                        }
                    } catch {
                        // Videos folder doesn't exist or can't be read
                    }

                    // Extract media references from parsed ink
                    const mediaRefs = extractMediaReferences(parsed);

                    // Validate media references against available files
                    const mediaErrors = validateMediaReferences(mediaRefs, availableImages, availableVideos);
                    allErrors = [...allErrors, ...mediaErrors];
                }
                // When ComfyUI is disabled, media errors are simply not added

                // Separate errors and warnings
                const errors = allErrors.filter(e => e.severity === 'error');
                const warnings = allErrors.filter(e => e.severity === 'warning');

                // Helper to find which knot a line belongs to
                const findKnotForLine = (lineNumber: number): string | null => {
                    for (const knot of parsed.knots) {
                        if (lineNumber >= knot.lineStart && lineNumber <= knot.lineEnd) {
                            return knot.name;
                        }
                    }
                    return null;
                };

                // Build result
                const lines: string[] = [];

                if (errors.length === 0 && warnings.length === 0) {
                    lines.push('✓ No errors or warnings found.');
                    lines.push('');
                    lines.push(`Validated ${parsed.knots.length} knot(s).`);
                } else {
                    if (errors.length > 0) {
                        lines.push(`## Errors (${errors.length})`);
                        for (const err of errors) {
                            const knotName = findKnotForLine(err.lineNumber);
                            const knotInfo = knotName ? ` (in knot "${knotName}")` : '';
                            lines.push(`- ❌ Line ${err.lineNumber}${knotInfo}: ${err.message}`);
                        }
                        lines.push('');
                    }

                    if (warnings.length > 0) {
                        lines.push(`## Warnings (${warnings.length})`);
                        for (const warn of warnings) {
                            const knotName = findKnotForLine(warn.lineNumber);
                            const knotInfo = knotName ? ` (in knot "${knotName}")` : '';
                            lines.push(`- ⚠️ Line ${warn.lineNumber}${knotInfo}: ${warn.message}`);
                        }
                        lines.push('');
                    }

                    lines.push(`Validated ${parsed.knots.length} knot(s): ${errors.length} error(s), ${warnings.length} warning(s).`);
                    lines.push(`To fix them, use the corresponding tools (eg. generate_image and modify_knot to update an image reference).`);
                }

                return {success: true, result: lines.join('\n')};
            } catch (error) {
                return {
                    success: false,
                    result: '',
                    error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // mark_goal_complete - Signal that the user's goal has been achieved
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'mark_goal_complete',
                description: "Signal that the user's goal has been achieved. Will validate the file first and ask for confirmation if there are errors.",
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
        executor: async (context, args) => {
            const sessionData = context.data as Record<string, unknown> | undefined;
            const pendingGoalComplete = sessionData?.pendingGoalComplete as boolean | undefined;

            // If this is the second consecutive call, actually complete the goal
            if (pendingGoalComplete) {
                return {
                    success: true,
                    result: `Goal completed: ${args.summary}`,
                    metadata: {
                        goalComplete: true,
                        summary: args.summary as string,
                    },
                };
            }

            // First call - validate the file and warn about any issues
            try {
                const {parseInk} = await import('../../../renderer/ink/parser/inkParser');
                const {
                    extractMediaReferences,
                    validateMediaReferences
                } = await import('../../../renderer/ink/parser/mediaValidator');

                const content = await context.fileService.readFile(context.inkFilePath);
                const parsed = parseInk(content);

                // Get all errors (excluding media for now)
                let allErrors = parsed.errors.filter(err => err.category !== 'media');

                // Check if ComfyUI is enabled for media validation
                const {readSettings} = await import('../../ipc/settings');
                const settings = await readSettings();
                const comfyUIEnabled = settings.comfyui?.enabled ?? false;

                if (comfyUIEnabled) {
                    const fs = await import('fs/promises');
                    const sep = context.projectPath.includes('\\') ? '\\' : '/';
                    const imagesFolder = `${context.projectPath}${sep}Images`;
                    const videosFolder = `${context.projectPath}${sep}Videos`;

                    const availableImages = new Set<string>();
                    const availableVideos = new Set<string>();

                    try {
                        const imageFiles = await fs.readdir(imagesFolder);
                        for (const file of imageFiles) availableImages.add(file);
                    } catch { /* folder doesn't exist */
                    }

                    try {
                        const videoFiles = await fs.readdir(videosFolder);
                        for (const file of videoFiles) availableVideos.add(file);
                    } catch { /* folder doesn't exist */
                    }

                    const mediaRefs = extractMediaReferences(parsed);
                    const mediaErrors = validateMediaReferences(mediaRefs, availableImages, availableVideos);
                    allErrors = [...allErrors, ...mediaErrors];
                }

                const errors = allErrors.filter(e => e.severity === 'error');
                const warnings = allErrors.filter(e => e.severity === 'warning');

                // Build result message
                const lines: string[] = [];

                if (errors.length === 0 && warnings.length === 0) {
                    // No issues - still require confirmation but with a positive message
                    lines.push('✓ Validation passed with no errors or warnings.');
                    lines.push('');
                    lines.push(`Summary: ${args.summary}`);
                    lines.push('');
                    lines.push('If you are satisfied with this summary, call mark_goal_complete again to confirm completion.');
                } else {
                    lines.push('⚠️ Validation found issues that should be reviewed before completing:');
                    lines.push('');

                    if (errors.length > 0) {
                        lines.push(`## Errors (${errors.length})`);
                        for (const err of errors) {
                            lines.push(`- ❌ Line ${err.lineNumber}: ${err.message}`);
                        }
                        lines.push('');
                    }

                    if (warnings.length > 0) {
                        lines.push(`## Warnings (${warnings.length})`);
                        for (const warn of warnings) {
                            lines.push(`- ⚠️ Line ${warn.lineNumber}: ${warn.message}`);
                        }
                        lines.push('');
                    }

                    lines.push('You should fix these issues before completing. However, if you want to ignore them,');
                    lines.push('call mark_goal_complete again to confirm completion anyway.');
                }

                return {
                    success: true,
                    result: lines.join('\n'),
                    metadata: {
                        pendingGoalComplete: true,
                    },
                };
            } catch (error) {
                // Validation failed, but still allow completion with warning
                return {
                    success: true,
                    result: `⚠️ Could not validate file: ${error instanceof Error ? error.message : 'Unknown error'}\n\nCall mark_goal_complete again to confirm completion anyway.`,
                    metadata: {
                        pendingGoalComplete: true,
                    },
                };
            }
        },
        countsTowardsIteration: false,
    },

    // -------------------------------------------------------------------------
    // ask_user - Ask the user a question and wait for their response
    // -------------------------------------------------------------------------
    {
        definition: {
            type: 'function',
            function: {
                name: 'ask_user',
                description: 'Ask the user a question and wait for their response. Use this when you need clarification, have options to present, or want user input before continuing.',
                parameters: {
                    type: 'object',
                    properties: {
                        question: {
                            type: 'string',
                            description: 'The question to ask the user',
                        },
                    },
                    required: ['question'],
                },
            },
        },
        executor: async (_context, args) => {
            const question = args.question as string;
            return {
                success: true,
                result: `Waiting for user response to: ${question}`,
                metadata: {
                    awaitingUserResponse: true,
                    question,
                },
            };
        },
        countsTowardsIteration: false,
    },
];

// ============================================================================
// Build lookup maps from TOOLS array
// ============================================================================

const TOOL_DEFINITIONS: ToolDefinition[] = TOOLS.map(t => t.definition);
const TOOL_EXECUTORS: Record<string, ToolExecutor> = {};
const ITERATION_COUNTING_TOOLS: string[] = [];

for (const tool of TOOLS) {
    const name = tool.definition.function.name;
    TOOL_EXECUTORS[name] = tool.executor;
    if (tool.countsTowardsIteration) {
        ITERATION_COUNTING_TOOLS.push(name);
    }
}

// ============================================================================
// Tool Provider Implementation
// ============================================================================

/**
 * Ink Tool Provider
 */
export class InkToolProvider implements IToolProvider {
    private additionalTools: ToolDefinition[] = [];
    private additionalExecutors: Record<string, ToolExecutor> = {};
    private additionalIterationTools: string[] = [];

    /**
     * Register additional tools (for extensibility)
     */
    registerTool(
        definition: ToolDefinition,
        executor: ToolExecutor,
        countsTowardsIteration: boolean = false
    ): void {
        this.additionalTools.push(definition);
        this.additionalExecutors[definition.function.name] = executor;
        if (countsTowardsIteration) {
            this.additionalIterationTools.push(definition.function.name);
        }
    }

    getToolDefinitions(): ToolDefinition[] {
        return [...TOOL_DEFINITIONS, ...this.additionalTools];
    }

    async executeTool(
        context: ToolExecutionContext,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<ToolResult> {
        const executor = TOOL_EXECUTORS[toolName] || this.additionalExecutors[toolName];

        if (!executor) {
            return {success: false, result: '', error: `Unknown tool: ${toolName}`};
        }

        return executor(context, args);
    }

    getIterationCountingTools(): string[] {
        return [...ITERATION_COUNTING_TOOLS, ...this.additionalIterationTools];
    }
}

/**
 * Create a new Ink tool provider instance
 */
export function createInkToolProvider(): InkToolProvider {
    return new InkToolProvider();
}
