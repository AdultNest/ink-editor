/**
 * Conversation Prompts
 *
 * System prompt templates for the AI conversation system.
 * Emphasizes chat-like output with short, precise dialogue.
 */

import type { CharacterAIConfig, MoodSet } from './characterConfig';

/**
 * Context for building system prompts
 */
export interface ConversationPromptContext {
  /** The user's goal for this session */
  goal: string;
  /** Character name (from config) */
  characterName?: string;
  /** Current mood/personality set */
  characterMood?: MoodSet;
  /** List of existing knot names */
  existingKnots: string[];
  /** Knots created during this session */
  createdKnots: string[];
  /** Story start knot (from initial divert) */
  startKnot?: string;
}

/**
 * Build the main system prompt for conversation
 */
export function buildConversationSystemPrompt(context: ConversationPromptContext): string {
  const {
    goal,
    characterName = 'the character',
    characterMood,
    existingKnots,
    createdKnots,
    startKnot,
  } = context;

  let prompt = `You are an interactive fiction writer creating content for an Ink-based visual novel.

## YOUR GOAL
${goal}

## WRITING STYLE GUIDELINES

### Dialogue Rules (CRITICAL)
- Write SHORT, PRECISE dialogue (1-3 sentences maximum)
- Each message should feel like a text message or brief spoken line
- EXCEPTION: Dramatic or emotional moments can have longer dialogue
- Avoid exposition dumps - reveal information through conversation
- Characters speak naturally, not formally

### Story Flow Rules
- Each knot should end with either:
  - Player choices (using * or + syntax)
  - A divert to another knot (-> knot_name)
- NEVER create dead ends (knots with no way forward)
- NEVER create infinite loops without player choice
- Connect new content to existing story structure

## INK SYNTAX REFERENCE

\`\`\`ink
// Basic dialogue (just text)
Hello there!
How are you doing today?

// Images (filename in angle brackets)
<character_smile.png>

// Player choices (sticky + vs one-time *)
* [Say hello] -> greeting_response
+ [Ask about the weather] -> weather_chat
* [Leave] -> END

// Conditional text
{ visited_before: Welcome back! | Nice to meet you! }

// Divert to another knot
-> next_scene

// End the story
-> END
\`\`\`

## STITCHES (CRITICAL FOR PLAYER MESSAGES)
When a player choice has content (like a player image) and needs to continue with more choices WITHIN THE SAME KNOT, use stitches:

\`\`\`ink
=== example_knot ===
What would you like to do?
* [Send a photo]
    <player-selfie.png>
    Nice photo!
    -> example_knot.after_photo
= after_photo
* [Send another] -> send_more
* [Done for now] -> goodbye
\`\`\`

Stitch naming: Use only [a-zA-Z_0-9]. Convert text by replacing spaces/special chars with underscores.

## CHARACTER CONTEXT
Character: ${characterName}`;

  if (characterMood) {
    prompt += `
Personality: ${characterMood.description}
Write dialogue that reflects this personality naturally.`;
  }

  prompt += `

## CURRENT STORY STATE`;

  if (startKnot) {
    prompt += `
- Story starts at: ${startKnot}`;
  }

  if (existingKnots.length > 0) {
    prompt += `
- Existing knots: ${existingKnots.slice(0, 20).join(', ')}${existingKnots.length > 20 ? ` (+${existingKnots.length - 20} more)` : ''}`;
  }

  if (createdKnots.length > 0) {
    prompt += `
- Knots you created this session: ${createdKnots.join(', ')}`;
  }

  prompt += `

## TOOL USAGE WORKFLOW

1. **First**: Use \`list_knots\` to understand the current story structure
2. **Investigate**: Use \`investigate_knot_tree\` and \`get_knot_content\` to understand context
3. **Create**: Use \`add_knot\` to create new content
4. **Connect**: Ensure new knots connect properly to existing story
5. **Complete**: Call \`mark_goal_complete\` when the goal is achieved

## IMPORTANT REMINDERS
- Start by exploring with list_knots
- Think about story flow before creating content
- Each knot body should NOT include the header (=== name ===), just the content
- Use snake_case for knot names (e.g., coffee_shop_intro)
- Call mark_goal_complete when done - don't leave the conversation hanging`;

  return prompt;
}

/**
 * Build a condensed context update for mid-conversation
 */
export function buildContextUpdate(context: {
  createdKnots: string[];
  modifiedKnots: string[];
  iterationsRemaining: number;
}): string {
  const parts: string[] = [];

  if (context.createdKnots.length > 0) {
    parts.push(`Created: ${context.createdKnots.join(', ')}`);
  }

  if (context.modifiedKnots.length > 0) {
    parts.push(`Modified: ${context.modifiedKnots.join(', ')}`);
  }

  parts.push(`Iterations remaining: ${context.iterationsRemaining}`);

  return `[Session Update: ${parts.join(' | ')}]`;
}

/**
 * Common goal examples for the UI
 */
export const GOAL_EXAMPLES = [
  'Add a new scene where the player can choose to go to the coffee shop',
  'Create a branching dialogue where the character gets angry if insulted',
  'Add 3 new knots that continue from the ending of intro_scene',
  'Create a conversation where the player can learn about the character\'s backstory',
  'Add choices to the current_scene knot that lead to different outcomes',
];

/**
 * Generate a suggested goal based on story state
 */
export function suggestGoal(existingKnots: string[], hasDeadEnds: boolean): string {
  if (existingKnots.length === 0) {
    return 'Create an opening scene that introduces the character and gives the player their first choice';
  }

  if (hasDeadEnds) {
    return 'Fix dead ends in the story by adding choices or diverts to continue the narrative';
  }

  if (existingKnots.length < 5) {
    return `Expand the story by adding 2-3 new scenes branching from ${existingKnots[existingKnots.length - 1] || 'the start'}`;
  }

  return 'Add a new branching path that gives players more agency in the story';
}

/**
 * Convert text to a valid stitch name
 * Only allows [a-zA-Z_0-9], replaces other chars with underscore
 *
 * @example
 * textToStitchName("Order a latte") // "order_a_latte"
 * textToStitchName("Say hello!") // "say_hello"
 */
export function textToStitchName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')  // Replace non-alphanumeric with _
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')           // Trim leading/trailing underscores
    .substring(0, 30);               // Limit length
}
