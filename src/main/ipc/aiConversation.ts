/**
 * AI Conversation Manager
 *
 * Handles multi-turn conversations with Ollama for story generation.
 * Manages the conversation loop, tool calling, and session state.
 */

import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';
import https from 'https';
import {
  createSession,
  getSession,
  updateSession,
  addMessage,
  incrementIteration,
  completeSession,
  errorSession,
  cancelSession,
  deleteSession,
  type ConversationSession,
  type OllamaMessage,
  type SessionConfig,
} from './aiSessionManager';
import { TOOL_DEFINITIONS, executeTool, isGoalComplete, getGoalCompletionSummary } from './aiTools';

// ============================================================================
// Types
// ============================================================================

/**
 * Ollama chat request
 */
export interface OllamaChatRequest {
  baseUrl: string;
  model: string;
  messages: OllamaMessage[];
  tools?: typeof TOOL_DEFINITIONS;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

/**
 * Ollama chat response
 */
export interface OllamaChatResponse {
  success: boolean;
  error?: string;
  message?: OllamaMessage;
  done?: boolean;
}

/**
 * Conversation turn result sent to renderer
 */
export interface ConversationTurnResult {
  sessionId: string;
  status: 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';
  message?: OllamaMessage;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
  iterationCount: number;
  maxIterations: number;
  createdKnots: string[];
  modifiedKnots: string[];
  error?: string;
  completionSummary?: string;
}

/**
 * Session state for renderer
 */
export interface ConversationSessionState {
  sessionId: string;
  status: 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';
  goal: string;
  messages: OllamaMessage[];
  iterationCount: number;
  maxIterations: number;
  createdKnots: string[];
  modifiedKnots: string[];
  error?: string;
}

// ============================================================================
// HTTP Helper
// ============================================================================

/**
 * Make HTTP request (for Ollama API)
 */
function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 120000, // 2 minute default for LLM calls
    };

    const req = httpModule.request(reqOptions, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// ============================================================================
// Ollama Chat API
// ============================================================================

// Track which models don't support tools (cached per session)
const modelsWithoutToolsSupport = new Set<string>();

/**
 * Build a text-based API description for models that don't support tools
 */
function buildToolsAsTextPrompt(): string {
  return `
## API Functions
Call functions by outputting JSON in this EXACT format (use code blocks):
\`\`\`json
{"function": "function_name", "arguments": {"arg1": "value1"}}
\`\`\`

IMPORTANT: You can call MULTIPLE functions in one message. Each function call should be a separate JSON block.

### Story Investigation
- list_knots: List all knots. Args: {}
- get_knot_content: Read a knot. Args: {"knot_name": "name"}
- investigate_knot_tree: See what leads to a knot. Args: {"knot_name": "name", "depth": 2}

### Story Editing
- add_knot: Create a knot. Args: {"name": "knot_name", "content": "ink content"}
- modify_knot: Edit a knot. Args: {"name": "knot_name", "new_content": "new content"}

### Image Generation
- list_image_options: Show available presets, moods, and library components. Args: {}
- generate_image: Create image. Args: {"scene_description": "what to show", "shot_type": "portrait|upper_body|full_body", ...}

### Session
- mark_goal_complete: Signal done. Args: {"summary": "what was accomplished"}

You can call multiple functions at once. All will be executed and you'll get the results.`;
}

/**
 * Parse text response for function calls (for models without tool support)
 * Supports multiple function calls in a single response
 */
function parseTextForFunctionCalls(text: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const seenCalls = new Set<string>(); // Track seen calls to avoid duplicates

  function addCall(name: string, args: Record<string, unknown>): void {
    const key = `${name}:${JSON.stringify(args)}`;
    if (!seenCalls.has(key)) {
      seenCalls.add(key);
      calls.push({ name, arguments: args });
      console.log(`[Conversation] Parsed function call: ${name}`);
    }
  }

  // Method 1: Look for JSON in code blocks (```json ... ```)
  const jsonBlockPattern = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/g;
  let match;
  while ((match = jsonBlockPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.function && typeof parsed.function === 'string') {
        addCall(parsed.function, parsed.arguments || {});
      }
    } catch (e) {
      console.warn('[Conversation] Failed to parse JSON block:', e);
    }
  }

  // Method 2: Look for raw JSON objects with "function" key
  // This handles LLM output like: {"function": "name", "arguments": {...}}
  // Use a more flexible approach: find all {...} blocks and try to parse them
  const rawJsonPattern = /\{[^{}]*"function"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^{}]*\}[^{}]*\}/g;
  while ((match = rawJsonPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.function && typeof parsed.function === 'string') {
        addCall(parsed.function, parsed.arguments || {});
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // Method 3: More aggressive parsing for multi-line JSON objects
  // Find patterns like: {\n  "function": "...",\n  "arguments": {...}\n}
  const multilinePattern = /\{\s*\n?\s*"function"\s*:\s*"([^"]+)"\s*,\s*\n?\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\n?\s*\}/g;
  while ((match = multilinePattern.exec(text)) !== null) {
    try {
      const funcName = match[1];
      const argsStr = match[2];
      const args = JSON.parse(argsStr);
      addCall(funcName, args);
    } catch {
      // Failed to parse, skip
    }
  }

  if (calls.length > 0) {
    console.log(`[Conversation] Total function calls parsed from text: ${calls.length}`);
  } else if (text.includes('"function"')) {
    console.warn('[Conversation] Text contains "function" but no calls were parsed. Raw text sample:', text.substring(0, 500));
  }

  return calls;
}

/**
 * Send a chat request to Ollama
 */
async function ollamaChat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
  const requestId = Date.now().toString(36);
  const modelKey = `${request.baseUrl}:${request.model}`;
  const useTextFallback = modelsWithoutToolsSupport.has(modelKey);

  try {
    const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

    // If using text fallback, modify system prompt to include tool descriptions
    let messages = request.messages;
    if (useTextFallback && request.tools && request.tools.length > 0) {
      messages = messages.map(msg => {
        if (msg.role === 'system') {
          return {
            ...msg,
            content: msg.content + '\n\n' + buildToolsAsTextPrompt(),
          };
        }
        return msg;
      });
    }

    const payload = {
      model: request.model,
      messages,
      tools: useTextFallback ? undefined : request.tools,
      stream: false,
      options: request.options || {},
    };

    console.log(`[Conversation:${requestId}] Sending chat request to ${url}/api/chat`);
    console.log(`[Conversation:${requestId}] Messages: ${request.messages.length}, Tools: ${useTextFallback ? 'text-fallback' : request.tools?.length || 0}`);

    const response = await httpRequest(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 180000, // 3 minute timeout for generation
    });

    console.log(`[Conversation:${requestId}] Response status: ${response.status}`);

    if (response.status !== 200) {
      const errorData = response.data.substring(0, 500);
      console.error(`[Conversation:${requestId}] Error response: ${errorData}`);

      // Check for "does not support tools" error
      if (errorData.includes('does not support tools')) {
        console.log(`[Conversation:${requestId}] Model does not support tools, switching to text fallback`);
        modelsWithoutToolsSupport.add(modelKey);
        // Retry with text fallback
        return ollamaChat(request);
      }

      return {
        success: false,
        error: `Server returned status ${response.status}`,
      };
    }

    const data = JSON.parse(response.data);

    // Check if error is in the response body
    if (data.error && data.error.includes('does not support tools')) {
      console.log(`[Conversation:${requestId}] Model does not support tools (from response), switching to text fallback`);
      modelsWithoutToolsSupport.add(modelKey);
      // Retry with text fallback
      return ollamaChat(request);
    }

    console.log(`[Conversation:${requestId}] Response received, done: ${data.done}`);

    // If using text fallback, parse the response for function calls
    if (useTextFallback && data.message?.content) {
      const functionCalls = parseTextForFunctionCalls(data.message.content);
      if (functionCalls.length > 0) {
        console.log(`[Conversation:${requestId}] Parsed ${functionCalls.length} function call(s) from text`);
        // Convert to tool_calls format
        data.message.tool_calls = functionCalls.map(call => ({
          function: {
            name: call.name,
            arguments: call.arguments,
          },
        }));
      }
    }

    return {
      success: true,
      message: data.message,
      done: data.done,
    };
  } catch (error) {
    console.error(`[Conversation:${requestId}] Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Chat request failed',
    };
  }
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Build the system prompt for the conversation
 */
function buildSystemPrompt(session: ConversationSession): string {
  const characterName = session.characterConfig?.meta?.contactName || 'the character';
  const defaultMood = session.characterConfig?.defaultMoodSet;
  const moodSet = session.characterConfig?.moodSets?.find(m => m.name === defaultMood);

  let prompt = `You are an interactive fiction writer creating content for an Ink-based visual novel.

## Your Goal
${session.goal}

## Guidelines
- Write SHORT, PRECISE dialogue messages (1-3 sentences typically)
- EXCEPTION: For dramatic or emotional moments, longer messages are acceptable
- Use tools to explore the existing story structure before making changes
- Each knot should end with either player choices or a divert to another knot
- NEVER create cycles back to earlier knots without explicit player choice
- Keep conversations natural and character-appropriate
- Call mark_goal_complete when you have achieved the user's goal

## Important Rules
1. Always use list_knots first to understand the current story structure
2. Before adding new knots, use investigate_knot_tree to understand the flow
3. New knots must connect properly - either diverts or choices leading to existing knots
4. Do not leave dead ends (knots with no way forward)
5. When a player choice has content (like a player image) but needs to continue within the same knot, use STITCHES

## Stitches (IMPORTANT)
When a player choice has content (like <player-image.png>) and needs more choices afterward without leaving the knot, you MUST use stitches:

Example:
\`\`\`ink
=== coffee_shop ===
Want some coffee?
* [Order a latte]
    <player-ordering.png>
    Here's your latte!
    -> coffee_shop.after_order
= after_order
* [Say thanks] -> thanks_response
* [Leave] -> exit
\`\`\`

Stitch naming rules:
- Use only letters, numbers, and underscores: [a-zA-Z_0-9]
- Convert player message text to stitch name by replacing non-alphanumeric chars with _
- Example: "Order a latte" -> "order_a_latte" or just "after_order"

## Character Context
Character: ${characterName}`;

  if (moodSet) {
    prompt += `\nMood/Personality: ${moodSet.description}`;
  }

  prompt += `

## Ink Syntax Quick Reference
- Dialogue: Just write text on a line
- Choices: Start with * (once) or + (sticky)
  * [Choice text] -> target_knot
  + [Reusable choice] -> target_knot
- Diverts: -> knot_name
- Images: <filename.png>
- Conditionals: { condition: result }

## Available Tools
Use these tools to explore and modify the story:
- list_knots: See all knots and their connections
- get_knot_content: Read a specific knot
- investigate_knot_tree: See what leads to a knot
- add_knot: Create a new knot
- modify_knot: Edit an existing knot
- generate_image: Create an image for a scene
- mark_goal_complete: Signal you're done

Start by exploring the current story structure with list_knots.`;

  return prompt;
}

// ============================================================================
// Conversation Loop
// ============================================================================

/**
 * Tools that count towards the iteration limit (content-creating tools)
 */
const ITERATION_COUNTING_TOOLS = ['add_knot', 'modify_knot'];

/**
 * Run a single conversation turn (internal, may auto-continue)
 */
async function runSingleTurn(
  sessionId: string,
  ollamaBaseUrl: string,
  ollamaModel: string,
  ollamaOptions?: { temperature?: number; maxTokens?: number }
): Promise<ConversationTurnResult & { shouldAutoContinue?: boolean }> {
  const session = getSession(sessionId);
  if (!session) {
    return {
      sessionId,
      status: 'error',
      iterationCount: 0,
      maxIterations: 0,
      createdKnots: [],
      modifiedKnots: [],
      error: 'Session not found',
    };
  }

  // Check if session is still active
  if (session.status !== 'active') {
    return {
      sessionId,
      status: session.status,
      iterationCount: session.iterationCount,
      maxIterations: session.maxIterations,
      createdKnots: session.createdKnots,
      modifiedKnots: session.modifiedKnots,
      error: session.errorMessage,
    };
  }

  // Build messages array (system + conversation history)
  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(session) },
    ...session.messages,
  ];

  // Send to Ollama
  const response = await ollamaChat({
    baseUrl: ollamaBaseUrl,
    model: ollamaModel,
    messages,
    tools: TOOL_DEFINITIONS,
    options: {
      temperature: ollamaOptions?.temperature ?? 0.7,
      num_predict: ollamaOptions?.maxTokens ?? 2048,
    },
  });

  if (!response.success || !response.message) {
    errorSession(sessionId, response.error || 'No response from Ollama');
    return {
      sessionId,
      status: 'error',
      iterationCount: session.iterationCount,
      maxIterations: session.maxIterations,
      createdKnots: session.createdKnots,
      modifiedKnots: session.modifiedKnots,
      error: response.error,
    };
  }

  // Add assistant message to history
  addMessage(sessionId, response.message);

  // Debug: Log message content
  const messageContent = response.message.content || '';
  const hasToolCalls = response.message.tool_calls && response.message.tool_calls.length > 0;
  console.log(`[Conversation] Assistant message: "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}" | Tool calls: ${hasToolCalls ? response.message.tool_calls!.length : 0}`);

  if (!messageContent && !hasToolCalls) {
    console.warn('[Conversation] WARNING: Empty message with no tool calls received from LLM');
    // Don't auto-continue on empty messages to prevent infinite loops
    return {
      sessionId,
      status: 'active',
      message: response.message,
      iterationCount: session.iterationCount,
      maxIterations: session.maxIterations,
      createdKnots: session.createdKnots,
      modifiedKnots: session.modifiedKnots,
      shouldAutoContinue: false,
    };
  }

  // Check for tool calls
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: string }> = [];
  let shouldAutoContinue = false;
  let hadContentCreatingTool = false;

  if (hasToolCalls) {
    for (const toolCall of response.message.tool_calls!) {
      const toolName = toolCall.function.name;
      const toolArgs = toolCall.function.arguments;

      console.log(`[Conversation] Executing tool: ${toolName}`);

      // Execute the tool
      const toolResult = await executeTool(session, toolName, toolArgs);

      console.log(`[Conversation] Tool result: ${toolResult.success ? 'success' : 'error'}`);

      toolCalls.push({
        name: toolName,
        arguments: toolArgs,
        result: toolResult.success ? toolResult.result : `Error: ${toolResult.error}`,
      });

      // Add tool result to conversation
      addMessage(sessionId, {
        role: 'tool',
        content: toolResult.success ? toolResult.result : `Error: ${toolResult.error}`,
      });

      // Track if this was a content-creating tool (counts towards iteration limit)
      if (ITERATION_COUNTING_TOOLS.includes(toolName)) {
        hadContentCreatingTool = true;
      }

      // Check if goal was completed
      if (isGoalComplete(toolResult)) {
        completeSession(sessionId);
        const summary = getGoalCompletionSummary(toolResult);
        return {
          sessionId,
          status: 'completed',
          message: response.message,
          toolCalls,
          iterationCount: session.iterationCount,
          maxIterations: session.maxIterations,
          createdKnots: session.createdKnots,
          modifiedKnots: session.modifiedKnots,
          completionSummary: summary,
        };
      }
    }

    // Auto-continue after tool calls to let LLM process results
    shouldAutoContinue = true;
  } else if (messageContent) {
    // No tool calls - check if LLM is asking a question that needs user input
    const trimmedContent = messageContent.trim();
    const isAskingQuestion =
      trimmedContent.endsWith('?') ||
      /\b(what|which|how|should I|do you want|would you like|can you|could you)\b/i.test(trimmedContent);

    if (isAskingQuestion) {
      console.log('[Conversation] LLM is asking a question, waiting for user input');
      shouldAutoContinue = false;
    } else {
      // LLM made a statement - might be thinking out loud, auto-continue
      console.log('[Conversation] LLM made a statement, auto-continuing');
      shouldAutoContinue = true;
    }
  }

  // Only increment iteration count for content-creating tools
  if (hadContentCreatingTool) {
    const updated = incrementIteration(sessionId);
    if (updated?.status === 'max_iterations') {
      return {
        sessionId,
        status: 'max_iterations',
        message: response.message,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        iterationCount: updated.iterationCount,
        maxIterations: updated.maxIterations,
        createdKnots: updated.createdKnots,
        modifiedKnots: updated.modifiedKnots,
      };
    }
  }

  // Get fresh session state
  const finalSession = getSession(sessionId);

  return {
    sessionId,
    status: finalSession?.status || 'active',
    message: response.message,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    iterationCount: finalSession?.iterationCount || session.iterationCount,
    maxIterations: finalSession?.maxIterations || session.maxIterations,
    createdKnots: finalSession?.createdKnots || session.createdKnots,
    modifiedKnots: finalSession?.modifiedKnots || session.modifiedKnots,
    shouldAutoContinue,
  };
}

/**
 * Run a conversation turn with auto-continue for tool calls
 */
async function runConversationTurn(
  sessionId: string,
  ollamaBaseUrl: string,
  ollamaModel: string,
  ollamaOptions?: { temperature?: number; maxTokens?: number }
): Promise<ConversationTurnResult> {
  console.log(`[Conversation] Starting conversation turn for session ${sessionId}`);

  let result: ConversationTurnResult & { shouldAutoContinue?: boolean };

  try {
    result = await runSingleTurn(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
  } catch (error) {
    console.error('[Conversation] Uncaught error in runSingleTurn:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errorSession(sessionId, errorMsg);
    return {
      sessionId,
      status: 'error',
      iterationCount: 0,
      maxIterations: 0,
      createdKnots: [],
      modifiedKnots: [],
      error: errorMsg,
    };
  }

  console.log(`[Conversation] Turn result: status=${result.status}, shouldAutoContinue=${result.shouldAutoContinue}`);

  // Notify after each turn (including tool call turns)
  notifyConversationUpdate(sessionId, result);

  // Auto-continue while there are tool calls and session is active
  let loopCount = 0;
  const maxLoops = 50; // Safety limit to prevent infinite loops

  while (result.shouldAutoContinue && result.status === 'active' && loopCount < maxLoops) {
    loopCount++;
    console.log(`[Conversation] Auto-continue loop iteration ${loopCount}`);

    // Check if session was cancelled before continuing
    const currentSession = getSession(sessionId);
    if (!currentSession || currentSession.status === 'cancelled') {
      console.log('[Conversation] Session cancelled, breaking loop');
      result = {
        ...result,
        status: 'cancelled',
        shouldAutoContinue: false,
      };
      notifyConversationUpdate(sessionId, result);
      break;
    }

    // Small delay to prevent overwhelming the API and allow cancellation to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      result = await runSingleTurn(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
    } catch (error) {
      console.error('[Conversation] Uncaught error in runSingleTurn (loop):', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errorSession(sessionId, errorMsg);
      result = {
        sessionId,
        status: 'error',
        iterationCount: 0,
        maxIterations: 0,
        createdKnots: [],
        modifiedKnots: [],
        error: errorMsg,
        shouldAutoContinue: false,
      };
    }

    console.log(`[Conversation] Loop turn result: status=${result.status}, shouldAutoContinue=${result.shouldAutoContinue}`);
    notifyConversationUpdate(sessionId, result);
  }

  if (loopCount >= maxLoops) {
    console.warn(`[Conversation] Max auto-continue loops (${maxLoops}) reached, stopping`);
  }

  console.log(`[Conversation] Conversation turn complete, total loops: ${loopCount}`);

  // Remove internal flag before returning
  const { shouldAutoContinue: _, ...finalResult } = result;
  return finalResult;
}

/**
 * Notify renderer about conversation updates
 */
function notifyConversationUpdate(sessionId: string, update: ConversationTurnResult): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('conversation:update', sessionId, update);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register conversation IPC handlers
 */
export function registerConversationHandlers(): void {
  // Start a new conversation session
  ipcMain.handle(
    'conversation:start',
    async (
      _event,
      config: SessionConfig & { ollamaBaseUrl: string; ollamaModel: string; ollamaOptions?: { temperature?: number; maxTokens?: number } }
    ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
      try {
        const session = createSession({
          goal: config.goal,
          maxIterations: config.maxIterations,
          projectPath: config.projectPath,
          inkFilePath: config.inkFilePath,
          characterConfig: config.characterConfig,
          promptLibrary: config.promptLibrary,
        });

        // Add initial user message (the goal)
        addMessage(session.id, {
          role: 'user',
          content: `My goal: ${config.goal}\n\nPlease start by exploring the current story structure.`,
        });

        console.log(`[Conversation] Started session: ${session.id}`);

        // Run the first turn automatically (notifications handled internally)
        await runConversationTurn(
          session.id,
          config.ollamaBaseUrl,
          config.ollamaModel,
          config.ollamaOptions
        );

        return { success: true, sessionId: session.id };
      } catch (error) {
        console.error('[Conversation] Failed to start session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start session',
        };
      }
    }
  );

  // Continue conversation (run next turn)
  ipcMain.handle(
    'conversation:continue',
    async (
      _event,
      sessionId: string,
      ollamaBaseUrl: string,
      ollamaModel: string,
      ollamaOptions?: { temperature?: number; maxTokens?: number }
    ): Promise<ConversationTurnResult> => {
      // Notifications handled internally by runConversationTurn
      return runConversationTurn(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
    }
  );

  // Send a user message and continue
  ipcMain.handle(
    'conversation:send',
    async (
      _event,
      sessionId: string,
      message: string,
      ollamaBaseUrl: string,
      ollamaModel: string,
      ollamaOptions?: { temperature?: number; maxTokens?: number }
    ): Promise<ConversationTurnResult> => {
      const session = getSession(sessionId);
      if (!session) {
        return {
          sessionId,
          status: 'error',
          iterationCount: 0,
          maxIterations: 0,
          createdKnots: [],
          modifiedKnots: [],
          error: 'Session not found',
        };
      }

      // Add user message
      addMessage(sessionId, { role: 'user', content: message });

      // Run next turn (notifications handled internally)
      return runConversationTurn(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
    }
  );

  // Get session state
  ipcMain.handle(
    'conversation:getState',
    async (_event, sessionId: string): Promise<ConversationSessionState | null> => {
      const session = getSession(sessionId);
      if (!session) {
        return null;
      }

      return {
        sessionId: session.id,
        status: session.status,
        goal: session.goal,
        messages: session.messages,
        iterationCount: session.iterationCount,
        maxIterations: session.maxIterations,
        createdKnots: session.createdKnots,
        modifiedKnots: session.modifiedKnots,
        error: session.errorMessage,
      };
    }
  );

  // Cancel a session
  ipcMain.handle('conversation:cancel', async (_event, sessionId: string): Promise<boolean> => {
    const result = cancelSession(sessionId);
    if (result) {
      notifyConversationUpdate(sessionId, {
        sessionId,
        status: 'cancelled',
        iterationCount: result.iterationCount,
        maxIterations: result.maxIterations,
        createdKnots: result.createdKnots,
        modifiedKnots: result.modifiedKnots,
      });
    }
    return !!result;
  });

  // End/delete a session
  ipcMain.handle('conversation:end', async (_event, sessionId: string): Promise<boolean> => {
    return deleteSession(sessionId);
  });
}

// Export the chat function for ai.ts to use
export { ollamaChat };
