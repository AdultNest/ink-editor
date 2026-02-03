/**
 * Conversation Prompts
 *
 * System prompt templates for the AI conversation system.
 * Emphasizes chat-like output with short, precise dialogue.
 */

import type { CharacterAIConfig } from './characterConfig';

/**
 * Context for building system prompts
 */
export interface ConversationPromptContext {
  /** The user's goal for this session */
  goal: string;
  /** Character name (from config) */
  characterName?: string;
  /** Current mood/personality description (from prompt library) */
  characterMoodDescription?: string;
  /** List of existing knot names */
  existingKnots: string[];
  /** Knots created during this session */
  createdKnots: string[];
  /** Story start knot (from initial divert) */
  startKnot?: string;
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
