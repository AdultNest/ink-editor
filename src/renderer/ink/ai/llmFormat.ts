/**
 * LLM JSON Format Types
 *
 * Compact format optimized for small context window LLMs.
 * Uses short keys: t=type, c=content, d=duration, f=filename, op=operation, n=name
 */

// Content item types for the compact LLM format
export type LLMContentItem =
  | { t: 'text'; c: string }              // NPC dialogue
  | { t: 'img'; f: string }               // NPC image reference
  | { t: 'wait'; d: number }              // Pause (seconds)
  | { t: 'type'; d: number }              // Typing indicator (seconds)
  | { t: 'flag'; op: 'set' | 'rm'; n: string }  // Set or remove flag
  | { t: 'choice'; text: string; to?: string }  // Player choice
  | { t: 'go'; to: string };              // Divert to knot

/**
 * A knot in the LLM response format
 */
export interface LLMKnot {
  name: string;
  items: LLMContentItem[];
}

/**
 * Complete LLM conversation response
 */
export interface LLMConversationResponse {
  knots: LLMKnot[];
  startKnot: string;
}

/**
 * Validates an LLM response and returns parsing errors
 */
export function validateLLMResponse(response: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be an object'] };
  }

  const resp = response as Record<string, unknown>;

  if (!Array.isArray(resp.knots)) {
    errors.push('Missing or invalid "knots" array');
  } else {
    for (let i = 0; i < resp.knots.length; i++) {
      const knot = resp.knots[i] as Record<string, unknown>;
      if (!knot.name || typeof knot.name !== 'string') {
        errors.push(`Knot ${i}: missing or invalid "name"`);
      }
      if (!Array.isArray(knot.items)) {
        errors.push(`Knot ${i}: missing or invalid "items" array`);
      } else {
        for (let j = 0; j < knot.items.length; j++) {
          const item = knot.items[j] as Record<string, unknown>;
          if (!item.t || typeof item.t !== 'string') {
            errors.push(`Knot ${i}, item ${j}: missing type "t"`);
          }
        }
      }
    }
  }

  if (!resp.startKnot || typeof resp.startKnot !== 'string') {
    errors.push('Missing or invalid "startKnot"');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parses an LLM response string into a typed response object
 */
export function parseLLMResponse(responseText: string): LLMConversationResponse | null {
  console.log('[LLM Parser] Starting to parse response');
  console.log('[LLM Parser] Input length:', responseText?.length ?? 0, 'chars');

  if (!responseText || typeof responseText !== 'string') {
    console.error('[LLM Parser] Invalid input: responseText is null, undefined, or not a string');
    console.error('[LLM Parser] Input type:', typeof responseText);
    console.error('[LLM Parser] Input value:', responseText);
    return null;
  }

  try {
    // Try to extract JSON from the response (in case there's extra text)
    let jsonStr = responseText.trim();
    console.log('[LLM Parser] Trimmed input (first 200 chars):', jsonStr.substring(0, 200));

    // Find JSON object boundaries
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');

    console.log('[LLM Parser] JSON boundaries - start:', startIdx, ', end:', endIdx);

    if (startIdx === -1 || endIdx === -1) {
      console.error('[LLM Parser] Could not find JSON object boundaries');
      console.error('[LLM Parser] Full response:', responseText);
      return null;
    }

    if (endIdx <= startIdx) {
      console.error('[LLM Parser] Invalid JSON boundaries: end index <= start index');
      console.error('[LLM Parser] Full response:', responseText);
      return null;
    }

    // Check if there's non-JSON content before/after
    if (startIdx > 0) {
      console.warn('[LLM Parser] Content before JSON:', jsonStr.substring(0, startIdx));
    }
    if (endIdx < jsonStr.length - 1) {
      console.warn('[LLM Parser] Content after JSON:', jsonStr.substring(endIdx + 1));
    }

    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    console.log('[LLM Parser] Extracted JSON length:', jsonStr.length, 'chars');
    console.log('[LLM Parser] Extracted JSON (first 500 chars):', jsonStr.substring(0, 500));

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
      console.log('[LLM Parser] JSON.parse succeeded');
    } catch (parseError) {
      console.error('[LLM Parser] JSON.parse failed:', parseError);
      console.error('[LLM Parser] Attempted to parse:', jsonStr);

      // Try to identify the problem area
      if (parseError instanceof SyntaxError) {
        const match = parseError.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1], 10);
          const start = Math.max(0, pos - 50);
          const end = Math.min(jsonStr.length, pos + 50);
          console.error('[LLM Parser] Error near position', pos, ':', jsonStr.substring(start, end));
          console.error('[LLM Parser] Character at position:', JSON.stringify(jsonStr.charAt(pos)));
        }
      }
      return null;
    }

    console.log('[LLM Parser] Validating parsed response structure');
    const validation = validateLLMResponse(parsed);

    if (!validation.valid) {
      console.error('[LLM Parser] Validation failed with errors:', validation.errors);
      console.error('[LLM Parser] Parsed object:', JSON.stringify(parsed, null, 2).substring(0, 1000));
      return null;
    }

    console.log('[LLM Parser] Validation passed');
    console.log('[LLM Parser] Parsed response has', parsed.knots?.length ?? 0, 'knots, startKnot:', parsed.startKnot);

    return parsed as LLMConversationResponse;
  } catch (error) {
    console.error('[LLM Parser] Unexpected error during parsing:', error);
    console.error('[LLM Parser] Full response:', responseText);
    return null;
  }
}

/**
 * Converts an LLM content item to Ink script format
 */
function contentItemToInk(item: LLMContentItem, indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);

  switch (item.t) {
    case 'text':
      return `${indent}${item.c}`;

    case 'img':
      return `${indent}# IMAGE: ${item.f}`;

    case 'wait':
      return `${indent}# WAIT: ${item.d}s`;

    case 'type':
      return `${indent}# TYPING: ${item.d}s`;

    case 'flag':
      if (item.op === 'set') {
        return `${indent}~ ${item.n} = true`;
      } else {
        return `${indent}~ ${item.n} = false`;
      }

    case 'choice':
      if (item.to) {
        return `${indent}+ [${item.text}] -> ${item.to}`;
      } else {
        return `${indent}+ [${item.text}]`;
      }

    case 'go':
      return `${indent}-> ${item.to}`;

    default:
      return `${indent}// Unknown item type`;
  }
}

/**
 * Converts an LLM knot to Ink script format
 */
function knotToInk(knot: LLMKnot): string {
  const lines: string[] = [];

  // Knot header
  lines.push(`=== ${knot.name} ===`);

  // Content items
  for (const item of knot.items) {
    lines.push(contentItemToInk(item));
  }

  return lines.join('\n');
}

/**
 * Converts a complete LLM response to Ink script format
 */
export function llmResponseToInk(response: LLMConversationResponse): string {
  const lines: string[] = [];

  // Add starting divert at the top
  lines.push(`-> ${response.startKnot}`);
  lines.push('');

  // Add each knot
  for (const knot of response.knots) {
    lines.push(knotToInk(knot));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Converts existing Ink script content to LLM format for context
 * This is a simplified parser for providing context to the LLM
 */
export function inkToLLMContext(inkContent: string): Partial<LLMConversationResponse> {
  const knots: LLMKnot[] = [];
  let currentKnot: LLMKnot | null = null;
  let startKnot = '';

  const lines = inkContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse knot headers
    const knotMatch = trimmed.match(/^===\s*(\w+)\s*===$/);
    if (knotMatch) {
      if (currentKnot) {
        knots.push(currentKnot);
      }
      currentKnot = { name: knotMatch[1], items: [] };
      if (!startKnot) {
        startKnot = knotMatch[1];
      }
      continue;
    }

    // Parse initial divert for start knot
    const divertMatch = trimmed.match(/^->\s*(\w+)$/);
    if (divertMatch && !currentKnot) {
      startKnot = divertMatch[1];
      continue;
    }

    if (!currentKnot) continue;

    // Parse choices
    const choiceMatch = trimmed.match(/^\+\s*\[([^\]]+)\](?:\s*->\s*(\w+))?/);
    if (choiceMatch) {
      currentKnot.items.push({
        t: 'choice',
        text: choiceMatch[1],
        to: choiceMatch[2],
      });
      continue;
    }

    // Parse diverts within knots
    if (divertMatch && currentKnot) {
      currentKnot.items.push({ t: 'go', to: divertMatch[1] });
      continue;
    }

    // Parse text (skip empty lines and comments)
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('~')) {
      currentKnot.items.push({ t: 'text', c: trimmed });
    }
  }

  // Add last knot
  if (currentKnot) {
    knots.push(currentKnot);
  }

  return {
    knots,
    startKnot: startKnot || (knots.length > 0 ? knots[0].name : ''),
  };
}

/**
 * Format description for the LLM system prompt
 */
export const LLM_FORMAT_DESCRIPTION = `
You must respond with valid JSON in this exact format:
{
  "knots": [
    {
      "name": "knot_name",
      "items": [
        { "t": "text", "c": "dialogue text" },
        { "t": "type", "d": 2 },
        { "t": "choice", "text": "choice text", "to": "target_knot" }
      ]
    }
  ],
  "startKnot": "first_knot_name"
}

Item types:
- { "t": "text", "c": "string" } - NPC dialogue
- { "t": "img", "f": "filename.png" } - Image reference
- { "t": "wait", "d": number } - Pause in seconds
- { "t": "type", "d": number } - Typing indicator
- { "t": "flag", "op": "set"|"rm", "n": "flag_name" } - Set/remove flag
- { "t": "choice", "text": "string", "to": "knot_name" } - Player choice
- { "t": "go", "to": "knot_name" } - Jump to knot

Rules:
- Use snake_case for knot names
- Each knot must end with choices or a "go" divert
- Choices can omit "to" for inline content
- Keep dialogue natural and concise
`;
