import { LLM_FORMAT_DESCRIPTION } from './llmFormat';

/**
 * Generation mode for AI conversation creation
 */
export type GenerationMode = 'new' | 'continue';

/**
 * Minimal context for continue mode - just the current knot
 */
export interface ContinueContext {
  knotName: string;
  knotContent: string;
  userPrompt: string;
}

/**
 * Context for new conversation generation
 */
export interface NewConversationContext {
  userPrompt: string;
  characterName?: string;
  sceneSetting?: string;
}

/**
 * Compact format description for continue mode (minimal tokens)
 */
const CONTINUE_FORMAT = `Respond with JSON:
{
  "knots": [{ "name": "knot_name", "items": [...] }],
  "startKnot": "first_knot"
}

Items: { "t": "text", "c": "dialogue" } | { "t": "choice", "text": "label", "to": "knot" } | { "t": "go", "to": "knot" }

Rules:
- Use unique snake_case knot names
- Each knot ends with choices OR { "t": "go", "to": "END" }
- NO loops back to earlier knots
- Keep it short: 1-3 knots max`;

/**
 * System prompt for continuing from a specific knot
 */
const CONTINUE_SYSTEM_PROMPT = `You continue interactive fiction dialogues.
Given a knot's content, generate what comes NEXT.

${CONTINUE_FORMAT}

IMPORTANT:
- Generate NEW knots only, never reference the input knot
- All paths must end with "to": "END" or new choices
- Do NOT create loops or back-references`;

/**
 * System prompt for creating new conversations
 */
const NEW_CONVERSATION_SYSTEM_PROMPT = `You write interactive fiction dialogues.

${LLM_FORMAT_DESCRIPTION}

IMPORTANT:
- Create a short conversation (2-4 knots)
- All paths must end with choices or "to": "END"
- Do NOT create loops - the story flows forward only
- Each knot should have unique content`;

/**
 * Build prompt for continue mode (minimal context)
 */
export function buildContinuePrompt(context: ContinueContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const userPrompt = `Current knot "${context.knotName}":
${context.knotContent.trim()}

Continue with: ${context.userPrompt}

Generate 1-2 new knots that follow from this. End all paths with "END" or choices.`;

  return {
    systemPrompt: CONTINUE_SYSTEM_PROMPT,
    userPrompt,
  };
}

/**
 * Build prompt for new conversation mode
 */
export function buildNewConversationPrompt(context: NewConversationContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const parts: string[] = [];

  if (context.characterName) {
    parts.push(`Character: ${context.characterName}`);
  }
  if (context.sceneSetting) {
    parts.push(`Setting: ${context.sceneSetting}`);
  }

  parts.push(`Create: ${context.userPrompt}`);
  parts.push('');
  parts.push('Generate a short conversation (2-4 knots). All paths end with "END" or choices. No loops.');

  return {
    systemPrompt: NEW_CONVERSATION_SYSTEM_PROMPT,
    userPrompt: parts.join('\n'),
  };
}

/**
 * Example prompts for new conversations
 */
export const EXAMPLE_PROMPTS = [
  'A friendly barista greets a customer',
  'A mysterious stranger at a tavern',
  'First meeting with a love interest',
  'Negotiating with a merchant',
];

/**
 * Example continue prompts
 */
export const CONTINUE_EXAMPLES = [
  'The conversation gets personal',
  'Something interrupts them',
  'They make a surprising revelation',
  'The mood shifts darker',
];
