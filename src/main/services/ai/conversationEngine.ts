/**
 * Conversation Engine
 *
 * Core conversation loop logic using dependency injection.
 * No direct dependencies on Electron, Ollama, or file system.
 * All external interactions go through injected interfaces.
 */

import type {
  ConversationEngineConfig,
  ConversationSession,
  ConversationTurnResult,
  LLMMessage,
  ToolExecutionContext,
  ILLMProvider,
  IToolProvider,
  IFileService,
  INotificationService,
  SystemPromptBuilder,
} from './interfaces';
import { SessionManager } from './sessionManager';

// ============================================================================
// Message History Summarization
// ============================================================================

/**
 * Configuration for message history summarization
 */
interface SummarizationConfig {
  /** Trigger summarization when message count exceeds this (default: 30) */
  messageThreshold: number;
  /** Number of recent messages to keep intact (default: 10) */
  recentMessagesToKeep: number;
}

const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  messageThreshold: 30,
  recentMessagesToKeep: 10,
};

/**
 * Format messages for AI summarization prompt
 */
function formatMessagesForSummarization(messages: LLMMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const content = msg.content || '';

    if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const call of msg.tool_calls) {
          const argsStr = JSON.stringify(call.function.arguments).substring(0, 200);
          parts.push(`[ASSISTANT called ${call.function.name}: ${argsStr}]`);
        }
      }
      if (content) {
        parts.push(`[ASSISTANT]: ${content.substring(0, 300)}`);
      }
    } else if (msg.role === 'user') {
      // Truncate long tool results
      const truncated = content.length > 300 ? content.substring(0, 300) + '...' : content;
      parts.push(`[USER/TOOL RESULT]: ${truncated}`);
    }
  }

  return parts.join('\n');
}

/**
 * Result of summarization attempt
 */
interface SummarizationResult {
  /** Messages to send to the LLM */
  messages: LLMMessage[];
  /** Whether summarization occurred */
  compacted: boolean;
  /** Number of messages that were summarized (if compacted) */
  messagesSummarized: number;
  /** Number of messages kept verbatim (if compacted) */
  messagesKept: number;
  /** The summary content (if compacted) */
  summaryContent?: string;
}

/**
 * Internal turn result with auto-continue flag
 */
interface InternalTurnResult extends ConversationTurnResult {
  shouldAutoContinue?: boolean;
  warning?: string;
}

/**
 * Conversation Engine
 *
 * Manages the conversation loop with an LLM, handling tool calls
 * and session state updates.
 */
export class ConversationEngine {
  private llmProvider: ILLMProvider;
  private toolProvider: IToolProvider;
  private fileService: IFileService;
  private notificationService: INotificationService;
  private systemPromptBuilder: SystemPromptBuilder;
  private llmOptions: {
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
  private summarizationConfig: SummarizationConfig;

  constructor(config: ConversationEngineConfig) {
    this.llmProvider = config.llmProvider;
    this.toolProvider = config.toolProvider;
    this.fileService = config.fileService;
    this.notificationService = config.notificationService;
    this.systemPromptBuilder = config.systemPromptBuilder;
    this.llmOptions = {
      temperature: config.llmOptions?.temperature ?? 0.7,
      maxTokens: config.llmOptions?.maxTokens ?? 2048,
      timeout: config.llmOptions?.timeout ?? 180000,
    };
    this.summarizationConfig = {
      messageThreshold: config.summarizationOptions?.messageThreshold ?? DEFAULT_SUMMARIZATION_CONFIG.messageThreshold,
      recentMessagesToKeep: config.summarizationOptions?.recentMessagesToKeep ?? DEFAULT_SUMMARIZATION_CONFIG.recentMessagesToKeep,
    };
  }

  /**
   * Use AI to generate a summary of older conversation history.
   * Returns the summary text, or null if summarization failed.
   */
  private async generateAISummary(
    session: ConversationSession,
    messagesToSummarize: LLMMessage[]
  ): Promise<string | null> {
    const formattedHistory = formatMessagesForSummarization(messagesToSummarize);

    const systemPrompt = `You are a conversation summarizer. Your task is to create a concise summary of a conversation between a user and an AI assistant working on an Ink story project.

The summary should capture:
1. The overall goal being worked on
2. Key actions taken (knots created, modified, images generated)
3. Any important decisions or user feedback
4. Current state of progress

Keep the summary concise but complete enough that the AI can continue the work without losing context. Focus on WHAT was done, not the exact back-and-forth.`;

    const prompt = `Summarize the following conversation history for an Ink story editing session.

Goal: ${session.goal}
Progress: ${session.iterationCount}/${session.maxIterations} iterations used

=== CONVERSATION TO SUMMARIZE ===
${formattedHistory}
=== END CONVERSATION ===

Provide a concise summary (3-10 sentences) that captures the key progress and context needed to continue the work:`;

    try {
      const response = await this.llmProvider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        options: {
          temperature: 0.3, // Lower temperature for more consistent summaries
          maxTokens: 500,
        },
      }, 30000); // 30 second timeout for summarization

      if (response.success && response.message?.content) {
        return response.message.content;
      }

      console.warn('[ConversationEngine] AI summarization failed:', response.error);
      return null;
    } catch (error) {
      console.warn('[ConversationEngine] AI summarization error:', error);
      return null;
    }
  }

  /**
   * Summarize message history if it exceeds the threshold.
   * Uses AI to generate a proper summary.
   * Modifies session.messages in place to compact the history.
   */
  private async summarizeHistoryIfNeeded(
    session: ConversationSession,
    sessionManager: SessionManager
  ): Promise<SummarizationResult> {
    const messages = session.messages;

    // Check if already summarized recently (look for summary marker in first message)
    const lastSummarizedAt = (session.data.lastSummarizedAtMessageCount as number) || 0;

    // Only summarize if we've grown past threshold AND added enough new messages since last summary
    // This prevents re-summarizing every single turn
    const newMessagesSinceLastSummary = messages.length - lastSummarizedAt;
    const shouldSummarize = messages.length > this.summarizationConfig.messageThreshold &&
                           newMessagesSinceLastSummary >= this.summarizationConfig.recentMessagesToKeep;

    if (!shouldSummarize) {
      return {
        messages,
        compacted: false,
        messagesSummarized: 0,
        messagesKept: messages.length,
      };
    }

    // Split messages: older ones to summarize, recent ones to keep
    const splitIndex = messages.length - this.summarizationConfig.recentMessagesToKeep;
    const messagesToSummarize = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);

    // Generate AI summary
    let summaryContent = await this.generateAISummary(session, messagesToSummarize);

    // Fallback to basic summary if AI fails
    if (!summaryContent) {
      summaryContent = `[Previous conversation summarized: ${messagesToSummarize.length} messages covering work toward goal "${session.goal}". Progress: ${session.iterationCount}/${session.maxIterations} iterations.]`;
    }

    const wrappedSummary = `=== CONVERSATION HISTORY SUMMARY ===\n${summaryContent}\n=== END SUMMARY ===\nContinue working toward the goal. The recent messages below show your current context.`;

    // Actually compact the session messages to prevent re-summarization
    const compactedMessages: LLMMessage[] = [
      { role: 'user', content: wrappedSummary },
      ...recentMessages,
    ];

    // Update the session's messages array in place
    session.messages.length = 0;
    session.messages.push(...compactedMessages);

    // Track that we've summarized
    sessionManager.updateSessionData(session.id, {
      lastSummarizedAtMessageCount: compactedMessages.length,
    });

    return {
      messages: compactedMessages,
      compacted: true,
      messagesSummarized: messagesToSummarize.length,
      messagesKept: recentMessages.length,
      summaryContent: wrappedSummary,
    };
  }

  /**
   * Create tool execution context from session
   */
  private createToolContext(session: ConversationSession): ToolExecutionContext {
    return {
      projectPath: session.projectPath,
      inkFilePath: session.inkFilePath,
      sessionId: session.id,
      fileService: this.fileService,
      notificationService: this.notificationService,
      data: session.data,
    };
  }

  /**
   * Detect if message content contains JSON that looks like a tool call.
   * This catches cases where the LLM outputs JSON with tool-like structure
   * instead of using the proper tool_calls mechanism.
   */
  private detectJsonToolCallInContent(content: string): boolean {
    // Find JSON objects in the content (may be preceded by text)
    const jsonObjects = this.extractJsonObjects(content);

    for (const jsonStr of jsonObjects) {
      try {
        const parsed = JSON.parse(jsonStr);

        // Check for object with "name" field (common tool call pattern)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          // Pattern: { "name": "tool_name", ... }
          if (typeof parsed.name === 'string') {
            // Check if it matches known tool names or has tool-like structure
            const toolLikeNames = [
              'add_knot', 'modify_knot', 'get_knot_content', 'get_story_structure',
              'mark_goal_complete', 'validate', 'ask_user', 'send_photos',
              'knot_format', 'generate_image', 'list_knots', 'investigate_knot_tree',
              'list_image_options', 'get_generation_capabilities'
            ];
            if (toolLikeNames.includes(parsed.name) || parsed.arguments || parsed.content || parsed.parameters) {
              return true;
            }
          }

          // Pattern: { "function": "tool_name", "arguments": ... }
          if (typeof parsed.function === 'string' && parsed.arguments) {
            return true;
          }

          // Pattern: { "function": { "name": "...", "arguments": ... } }
          if (parsed.function && typeof parsed.function === 'object' && parsed.function.name) {
            return true;
          }

          // Pattern: { "tool_calls": [...] }
          if (Array.isArray(parsed.tool_calls)) {
            return true;
          }

          // Pattern: { "tool": "tool_name", ... }
          if (typeof parsed.tool === 'string') {
            return true;
          }
        }

        // Check for array of tool-like objects
        if (Array.isArray(parsed) && parsed.length > 0) {
          const firstItem = parsed[0];
          if (typeof firstItem === 'object' && firstItem !== null) {
            if (firstItem.name || firstItem.function || firstItem.tool_calls || firstItem.tool) {
              return true;
            }
          }
        }
      } catch {
        // Not valid JSON, continue to next potential JSON object
        continue;
      }
    }

    return false;
  }

  /**
   * Extract potential JSON objects from text content.
   * Finds balanced { } blocks that could be JSON.
   */
  private extractJsonObjects(content: string): string[] {
    const results: string[] = [];
    let i = 0;

    while (i < content.length) {
      if (content[i] === '{') {
        let depth = 1;
        const start = i;
        let inString = false;
        let escape = false;
        i++;

        while (i < content.length && depth > 0) {
          const char = content[i];

          if (escape) {
            escape = false;
          } else if (char === '\\' && inString) {
            escape = true;
          } else if (char === '"' && !escape) {
            inString = !inString;
          } else if (!inString) {
            if (char === '{') depth++;
            else if (char === '}') depth--;
          }
          i++;
        }

        if (depth === 0) {
          results.push(content.substring(start, i));
        }
      } else {
        i++;
      }
    }

    return results;
  }

  /**
   * Build result from session state
   */
  private buildResult(
    session: ConversationSession,
    message?: LLMMessage,
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result: string }>,
    completionSummary?: string,
    warning?: string,
    compactionInfo?: SummarizationResult,
    awaitingUserResponse?: boolean,
    userQuestion?: string
  ): ConversationTurnResult {
    // Extract createdKnots and modifiedKnots from session data
    const createdKnots = (session.data?.createdKnots as string[]) ?? [];
    const modifiedKnots = (session.data?.modifiedKnots as string[]) ?? [];

    const result: ConversationTurnResult = {
      sessionId: session.id,
      status: session.status,
      message,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      iterationCount: session.iterationCount,
      maxIterations: session.maxIterations,
      createdKnots,
      modifiedKnots,
      error: session.errorMessage,
      warning,
      completionSummary,
      data: session.data,
    };

    // Add compaction info if compaction occurred
    if (compactionInfo?.compacted) {
      result.historyCompaction = {
        occurred: true,
        messagesSummarized: compactionInfo.messagesSummarized,
        messagesKept: compactionInfo.messagesKept,
        summary: compactionInfo.summaryContent || '',
      };
    }

    // Add awaiting user response info if applicable
    if (awaitingUserResponse) {
      result.awaitingUserResponse = true;
      result.userQuestion = userQuestion;
    }

    return result;
  }

  /**
   * Run a single conversation turn
   */
  async runSingleTurn(
    session: ConversationSession,
    sessionManager: SessionManager
  ): Promise<InternalTurnResult> {
    // Check if session is still active
    if (session.status !== 'active') {
      return {
        ...this.buildResult(session),
        shouldAutoContinue: false,
      };
    }

    // Build messages array (system + conversation history)
    // If history is too long, summarize older messages to prevent context overflow
    const summarizationResult = await this.summarizeHistoryIfNeeded(session, sessionManager);
    const messages: LLMMessage[] = [
      { role: 'system', content: this.systemPromptBuilder(session) },
      ...summarizationResult.messages,
    ];

    // Send to LLM
    const response = await this.llmProvider.chat(
      {
        messages,
        tools: this.toolProvider.getToolDefinitions(),
        options: {
          temperature: this.llmOptions.temperature,
          maxTokens: this.llmOptions.maxTokens,
        },
      },
      this.llmOptions.timeout
    );

    if (!response.success || !response.message) {
      const errorMsg = response.error || 'No response from LLM';
      sessionManager.errorSession(session.id, errorMsg);
      return {
        ...this.buildResult(
          sessionManager.getSession(session.id) || session,
          undefined, undefined, undefined, undefined,
          summarizationResult
        ),
        shouldAutoContinue: false,
      };
    }

    // Add assistant message to history
    sessionManager.addMessage(session.id, response.message);

    // Check for JSON parse errors (from text fallback mode)
    // If there were parse errors and no successful tool calls, tell the LLM about the syntax error
    if (response.jsonParseErrors && response.jsonParseErrors.length > 0) {
      const hasToolCalls = response.message.tool_calls && response.message.tool_calls.length > 0;
      if (!hasToolCalls) {
        // Build error message with details about the syntax error
        const errorParts = response.jsonParseErrors.map((err, idx) => {
          return `Error ${idx + 1}: ${err.error}\nInvalid JSON:\n${err.originalJson}`;
        });

        const errorMessage = `Error: Failed to parse your tool call JSON. The syntax is invalid and could not be processed.

${errorParts.join('\n\n')}

Please fix the JSON syntax error and try again. Common issues:
- Missing or extra commas
- Unquoted property names
- Missing closing braces or brackets
- Invalid escape sequences in strings
- Trailing commas before closing braces/brackets`;

        // Add error message to conversation so LLM can correct itself
        sessionManager.addMessage(session.id, {
          role: 'user',
          content: errorMessage,
        });

        // Return with auto-continue so LLM can try again
        return {
          ...this.buildResult(
            sessionManager.getSession(session.id) || session,
            response.message,
            undefined,
            undefined,
            'The AI sent invalid JSON in its tool call. It has been informed of the syntax error.',
            summarizationResult
          ),
          shouldAutoContinue: true,
        };
      }
    }

    // Debug info
    const messageContent = response.message.content || '';
    const hasToolCalls = response.message.tool_calls && response.message.tool_calls.length > 0;

    if (!messageContent && !hasToolCalls) {
      // Empty message with no tool calls - remind LLM to use tools and auto-continue
      const emptyResponseReminder = `Error: You returned an empty response without calling any tools. Nothing has happened.

To make progress on the goal, you MUST call a tool. You cannot just think about what to do - you must actually do it by calling a tool.

To call a tool, output a JSON block in this format:
\`\`\`json
{ "function": "tool_name", "arguments": { "param1": "value1" } }
\`\`\`

Available tools include: add_knot, modify_knot, get_knot_content, get_story_structure, mark_goal_complete, ask_user, generate_image, and others.

Please call the appropriate tool now to continue working on the goal: "${session.goal}"`;

      sessionManager.addMessage(session.id, {
        role: 'user',
        content: emptyResponseReminder,
      });

      return {
        ...this.buildResult(
          sessionManager.getSession(session.id) || session,
          response.message,
          undefined,
          undefined,
          'The AI returned an empty response. It has been reminded to use tool calls.',
          summarizationResult
        ),
        shouldAutoContinue: true,
      };
    }

    // Check if the LLM outputted JSON that looks like a tool call in its content
    // instead of using the proper tool_calls mechanism
    if (messageContent && !hasToolCalls) {
      const looksLikeToolCall = this.detectJsonToolCallInContent(messageContent);
      if (looksLikeToolCall) {
        const errorMessage = `Error: Your response contains JSON that looks like a tool call, but you didn't use the proper tool calling mechanism. Your message content was:

${messageContent.substring(0, 500)}${messageContent.length > 500 ? '...' : ''}

To use a tool, you must make an actual tool call - not just output JSON. Please call the appropriate tool (e.g., add_knot, modify_knot, send_photos) using the tool calling interface.`;

        // Add error message to conversation so LLM can correct itself
        sessionManager.addMessage(session.id, {
          role: 'user',
          content: errorMessage,
        });

        // Return with auto-continue so LLM can try again
        return {
          ...this.buildResult(
            sessionManager.getSession(session.id) || session,
            response.message,
            undefined,
            undefined,
            'The AI outputted JSON instead of making a proper tool call. It has been reminded to use the tool calling mechanism.',
            summarizationResult
          ),
          shouldAutoContinue: true,
        };
      }

      // LLM responded with plain text instead of a tool call - remind it to use tools
      const reminderMessage = `Error: You responded with plain text instead of calling a tool. Nothing has happened yet.

Your response was:
"${messageContent.substring(0, 300)}${messageContent.length > 300 ? '...' : ''}"

IMPORTANT: To make progress on the goal, you MUST call a tool. You cannot just describe what you want to do - you must actually do it by calling a tool.

To call a tool, output a JSON block in this format:
\`\`\`json
{ "function": "tool_name", "arguments": { "param1": "value1" } }
\`\`\`

Available tools include: add_knot, modify_knot, get_knot_content, get_story_structure, mark_goal_complete, ask_user, generate_image, and others.

Please call the appropriate tool now to continue working on the goal.`;

      // Add reminder to conversation so LLM can correct itself
      sessionManager.addMessage(session.id, {
        role: 'user',
        content: reminderMessage,
      });

      // Return with auto-continue so LLM can try again
      return {
        ...this.buildResult(
          sessionManager.getSession(session.id) || session,
          response.message,
          undefined,
          undefined,
          'The AI responded with text instead of calling a tool. It has been reminded to use tool calls.',
          summarizationResult
        ),
        shouldAutoContinue: true,
      };
    }

    // Process tool calls
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: string }> = [];
    let shouldAutoContinue = false;
    let hadContentCreatingTool = false;
    const iterationCountingTools = this.toolProvider.getIterationCountingTools();

    if (hasToolCalls) {
      const context = this.createToolContext(session);

      // Check if LLM tried to call multiple tools at once
      if (response.message.tool_calls!.length > 1) {
        const toolNames = response.message.tool_calls!.map(tc => tc.function.name).join(', ');
        const errorMessage = `Error: You attempted to call ${response.message.tool_calls!.length} tools at once (${toolNames}). Only ONE tool call is allowed per turn. Please call tools one at a time.`;

        // Add error message to conversation so LLM can correct itself
        sessionManager.addMessage(session.id, {
          role: 'user',
          content: errorMessage,
        });

        // Return with auto-continue so LLM can try again
        return {
          ...this.buildResult(
            sessionManager.getSession(session.id) || session,
            response.message,
            undefined,
            undefined,
            'The AI attempted to call multiple tools at once. It has been reminded to call one tool at a time.',
            summarizationResult
          ),
          shouldAutoContinue: true,
        };
      }

      for (const toolCall of response.message.tool_calls!) {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments;

        // Reset pendingGoalComplete for any tool other than mark_goal_complete
        // This implements the "second chance" reset behavior
        if (toolName !== 'mark_goal_complete') {
          sessionManager.updateSessionData(session.id, { pendingGoalComplete: false });
        }

        // Execute the tool
        const toolResult = await this.toolProvider.executeTool(context, toolName, toolArgs);

        toolCalls.push({
          name: toolName,
          arguments: toolArgs,
          result: toolResult.success ? toolResult.result : `Error: ${toolResult.error}`,
        });

        // Add tool result to conversation
        sessionManager.addMessage(session.id, {
          role: 'user',
          content: toolResult.success ? toolResult.result : `Error: ${toolResult.error}`,
        });

        // Track if this was a content-creating tool
        if (toolResult.error === undefined && iterationCountingTools.includes(toolName)) {
          hadContentCreatingTool = true;
        }

        // Update session data from tool metadata (e.g., pendingGoalComplete)
        if (toolResult.metadata?.pendingGoalComplete !== undefined) {
          sessionManager.updateSessionData(session.id, {
            pendingGoalComplete: toolResult.metadata.pendingGoalComplete
          });
        }

        // Check if goal was completed
        if (toolResult.metadata?.goalComplete) {
          // Clear pendingGoalComplete on actual completion
          sessionManager.updateSessionData(session.id, { pendingGoalComplete: false });
          sessionManager.completeSession(session.id);
          const summary = toolResult.metadata.summary || '';
          return {
            ...this.buildResult(
              sessionManager.getSession(session.id) || session,
              response.message,
              toolCalls,
              summary,
              undefined,
              summarizationResult
            ),
            shouldAutoContinue: false,
          };
        }

        // Check if LLM is asking user a question via ask_user tool
        if (toolResult.metadata?.awaitingUserResponse) {
          return {
            ...this.buildResult(
              sessionManager.getSession(session.id) || session,
              response.message,
              toolCalls,
              undefined,
              undefined,
              summarizationResult,
              true,  // awaitingUserResponse
              toolResult.metadata.question as string  // userQuestion
            ),
            shouldAutoContinue: false,
          };
        }
      }

      // Auto-continue after tool calls to let LLM process results
      shouldAutoContinue = true;
    }

    // Increment iteration count for content-creating tools
    if (hadContentCreatingTool) {
      const updated = sessionManager.incrementIteration(session.id);
      if (updated?.status === 'max_iterations') {
        return {
          ...this.buildResult(updated, response.message, toolCalls, undefined, undefined, summarizationResult),
          shouldAutoContinue: false,
        };
      }
    }

    // Get fresh session state
    const finalSession = sessionManager.getSession(session.id) || session;

    return {
      ...this.buildResult(finalSession, response.message, toolCalls, undefined, undefined, summarizationResult),
      shouldAutoContinue,
    };
  }

  /**
   * Run a conversation turn with auto-continue for tool calls
   */
  async runConversationTurn(
    sessionId: string,
    sessionManager: SessionManager
  ): Promise<ConversationTurnResult> {
    const session = sessionManager.getSession(sessionId);
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

    let result: InternalTurnResult;

    try {
      result = await this.runSingleTurn(session, sessionManager);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      sessionManager.errorSession(sessionId, errorMsg);
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

    // Notify after each turn
    this.notificationService.notifyConversationUpdate(sessionId, result);

    // Auto-continue loop (turn limit and player control handle stopping)
    while (result.shouldAutoContinue && result.status === 'active') {

      // Check if session was cancelled
      const currentSession = sessionManager.getSession(sessionId);
      if (!currentSession || currentSession.status === 'cancelled') {
        result = {
          ...result,
          status: 'cancelled',
          shouldAutoContinue: false,
        };
        this.notificationService.notifyConversationUpdate(sessionId, result);
        break;
      }

      // Small delay to prevent overwhelming the API
      await this.delay(100);

      try {
        result = await this.runSingleTurn(currentSession, sessionManager);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        sessionManager.errorSession(sessionId, errorMsg);
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

      this.notificationService.notifyConversationUpdate(sessionId, result);
    }

    // Remove internal flag before returning
    const { shouldAutoContinue: _, ...finalResult } = result;
    return finalResult;
  }

  /**
   * Delay helper (can be overridden in tests)
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a conversation engine with configuration
 */
export function createConversationEngine(config: ConversationEngineConfig): ConversationEngine {
  return new ConversationEngine(config);
}
