/**
 * AI Conversation IPC Handlers
 *
 * Thin IPC layer that wires up the conversation engine with concrete implementations.
 * All business logic is delegated to the services layer.
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  ConversationEngine,
  SessionManager,
  InkToolProvider,
  createOllamaProvider,
  createNodeFileService,
  createElectronNotificationService,
  createEditorFileService,
  type EditorFileService,
  type ConversationSession,
  type ConversationTurnResult,
  type LLMMessage,
} from '../services/ai';
import type { CharacterAIConfig } from '../../renderer/ink/ai/characterConfig';
import type { ProjectPromptLibrary } from '../../renderer/services/promptLibrary.types';
import { PromptComponentCategory } from '../../renderer/services/promptLibrary.types';
import { readSettings } from './settings';

// Simple helper to get mood description from library (main process version)
const promptLibraryService = {
  getMoodDescription(library: ProjectPromptLibrary, moodId: string): string | null {
    const component = library.components?.find(c => c.id === moodId);
    if (!component || component.category !== PromptComponentCategory.MOOD) {
      return null;
    }
    return component.description || null;
  },
};

// ============================================================================
// Types for IPC
// ============================================================================

/**
 * Session configuration from renderer
 */
interface SessionConfigIPC {
  goal: string;
  maxIterations: number;
  projectPath: string;
  inkFilePath: string;
  characterConfig?: CharacterAIConfig | null;  // Contact character (backward compat)
  playerCharacterConfig?: CharacterAIConfig | null;  // Player character
  promptLibrary?: ProjectPromptLibrary | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * Session state for renderer
 */
export interface ConversationSessionState {
  sessionId: string;
  status: 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';
  goal: string;
  messages: LLMMessage[];
  iterationCount: number;
  maxIterations: number;
  createdKnots: string[];
  modifiedKnots: string[];
  error?: string;
  createdAt?: number;
  lastActivityAt?: number;
}

// Re-export types for backward compatibility
export type { ConversationTurnResult };

// ============================================================================
// Singleton instances
// ============================================================================

const sessionManager = new SessionManager();
const diskFileService = createNodeFileService();
const notificationService = createElectronNotificationService();
const toolProvider = new InkToolProvider();

// Track conversation engines and editor file services per session
interface SessionResources {
  engine: ConversationEngine;
  editorFileService: EditorFileService;
}
const sessionResources = new Map<string, SessionResources>();

// ============================================================================
// Editor Content Request via IPC
// ============================================================================

// Pending content requests awaiting response from renderer
const pendingContentRequests = new Map<string, {
  resolve: (content: string | null) => void;
  reject: (error: Error) => void;
}>();

let contentRequestId = 0;

/**
 * Request current content from the editor for a given file path.
 * Uses IPC to ask the renderer for the current editor content.
 */
async function requestEditorContent(filePath: string): Promise<string | null> {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    console.warn('[Conversation] No windows available to request content');
    return null;
  }

  const requestId = `content-req-${++contentRequestId}`;

  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeout = setTimeout(() => {
      pendingContentRequests.delete(requestId);
      console.warn(`[Conversation] Content request ${requestId} timed out`);
      resolve(null); // Fall back to disk on timeout
    }, 5000);

    pendingContentRequests.set(requestId, {
      resolve: (content) => {
        clearTimeout(timeout);
        pendingContentRequests.delete(requestId);
        resolve(content);
      },
      reject: (error) => {
        clearTimeout(timeout);
        pendingContentRequests.delete(requestId);
        reject(error);
      },
    });

    // Send request to all windows (typically just one)
    for (const win of windows) {
      win.webContents.send('conversation:request-content', requestId, filePath);
    }
  });
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Build the system prompt for ink story generation
 */
function buildInkSystemPrompt(session: ConversationSession): string {
  const data = session.data as {
    characterConfig?: CharacterAIConfig | null;
    promptLibrary?: ProjectPromptLibrary | null;
    timeoutSeconds?: number;
  };

  const characterName = data.characterConfig?.meta?.contactName || 'the character';
  const defaultMoodId = data.characterConfig?.defaultMoodId;
  const moodDescription = defaultMoodId && data.promptLibrary
    ? promptLibraryService.getMoodDescription(data.promptLibrary, defaultMoodId)
    : null;
  const timeoutSeconds = data.timeoutSeconds ?? 180;

  let prompt = `You are an interactive fiction writer creating chat-style conversations.

## Your Goal
${session.goal}

## Your Limitations
Maximum knots to create: ${session.maxIterations}
Response timeout: ${timeoutSeconds} seconds per turn - keep responses focused and avoid excessive planning text

## Workflow
1. Plan out the new knots to add
2. Write out individual knots
3. Modify relevant knots (eg. to connect to a new knot)
4. Review that all knots exist
5. Review the modified knots for logical flow
6. Call validate to ensure no errors exist
7. Call mark_goal_complete to end processing

## Guidelines
- Write SHORT, PRECISE dialogue messages (chat style, use multiple messages to convey longer dialogue)
- A story is formulated out of multiple knots
- A knot is a story bit, allowing to present different paths for different decisions, effectively: a decision tree
- Use tools to explore the existing story structure before making changes
- Each knot should end with either player choices or a divert to another knot
- NEVER create cycles back to earlier knots without explicit player choice
- Keep conversations natural and character-appropriate
- Call mark_goal_complete when you have achieved the user's goal (validate that you have left no dangling ends first)
  Note: Interpret the users goal creatively, not literal, eg "Create Initial Scene" means that you create the initial scenery with multiple knots.
- Call ask_user when you need clarification, want to present options, or need user input before continuing
- Remember that two people write each other, keep the roles separated while thinking

## Important Rules
1. If the story is EMPTY: CALL add_knot to create the first knot (typically named "start")
2. If the story is having ONLY an empty start knot with a divert to END: CALL modify_knot to modify the start knot
3. If the story has content: CALL get_knot_content to read specific knots before modifying them
4. New knots must connect properly - choices should lead to existing or planned knots
5. Do not leave dead ends (knots with no way forward)
6. Divert to END when a knot ends the conversation
7. Proximity: Assume people are not close unless stated otherwise
8. Review that single messages look like humans chatting (eg. ["hey", "how are you?"] instead of ["Hey, how are you?"])
9. No Video Calls: Use images to illustrate, but keep the chat flowing; avoid video calls
10. Player Sender: Always attribute player messages with "player"
11. No Narrative: Narrative breaks the illusion of chatting with a real person

## OUTPUT CRITICAL
Split long story conversation chat messages into MULTIPLE short messages!
BAD:
  { "message": { "speaker": "Sam"; "text": "Hey! How are you? I was thinking that maybe we could go somewhere." } }
GOOD:
  { "message": { "speaker": "Sam", "text": "Hey!" } }
  { "message": { "speaker": "Sam", "text": "How are you?" } }
  { "message": { "speaker": "Sam", "text": "I was thinking..." } }
  { "message": { "speaker": "Sam", "text": "Maybe we could go somewhere 😊" } }

## RULE CRITICAL
- When inserting an image, it won't appear out of thin air. Use a tool call to create one.
- Story content is a series of knots with diverts allowing to move from one knot to another.
- There is NEVER any text based story!
- USE TOOLS to expand the knots and to archive a concise story.
- ALWAYS generate images when used in story

## Character Context
Name: ${characterName}`;

  if (moodDescription) {
    prompt += `\nPersonality: ${moodDescription}`;
  }

  prompt += `
## REMEMBER
Outputting JSON without a tool call does NOTHING. Always use tool calls. Consider starting with calling knot_format to discover the knot format.`;

  return prompt;
}

// ============================================================================
// Engine Factory
// ============================================================================

/**
 * Create or get conversation engine for a session.
 * Each session gets its own editor file service that reads from the editor
 * and notifies it of changes (no disk I/O).
 */
async function getOrCreateEngine(
  sessionId: string,
  ollamaBaseUrl: string,
  ollamaModel: string,
  ollamaOptions?: { temperature?: number; maxTokens?: number }
): Promise<ConversationEngine> {
  let resources = sessionResources.get(sessionId);

  if (!resources) {
    // Read settings to get summarization and timeout options
    const settings = await readSettings();
    const ollamaSettings = settings.ollama;
    const timeoutSeconds = ollamaSettings?.timeoutSeconds ?? 180;
    const timeoutMs = timeoutSeconds * 1000;

    // Create an editor file service for this session
    // It requests content from the editor and notifies it of changes
    const editorFileService = createEditorFileService(
      requestEditorContent,
      notificationService,
      diskFileService
    );

    const engine = new ConversationEngine({
      llmProvider: createOllamaProvider({
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
      }),
      toolProvider,
      fileService: editorFileService, // Use editor, not disk
      notificationService,
      systemPromptBuilder: buildInkSystemPrompt,
      llmOptions: {
        temperature: ollamaOptions?.temperature ?? 0.7,
        maxTokens: ollamaOptions?.maxTokens ?? 2048,
        timeout: timeoutMs,
      },
      summarizationOptions: {
        messageThreshold: ollamaSettings?.summarizeAfterMessages ?? 30,
        recentMessagesToKeep: ollamaSettings?.keepRecentMessages ?? 10,
      },
      // Pass timeout to session data for system prompt
      timeoutSeconds,
    });

    resources = { engine, editorFileService };
    sessionResources.set(sessionId, resources);
  }

  return resources.engine;
}

/**
 * Clean up resources for session
 */
function cleanupSession(sessionId: string): void {
  sessionResources.delete(sessionId);
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register conversation IPC handlers
 */
export function registerConversationHandlers(): void {
  // Handle content response from renderer
  ipcMain.on('conversation:content-response', (_event, requestId: string, content: string | null) => {
    const pending = pendingContentRequests.get(requestId);
    if (pending) {
      pending.resolve(content);
    } else {
      console.warn(`[Conversation] Received content response for unknown request: ${requestId}`);
    }
  });

  // Start a new conversation session
  ipcMain.handle(
    'conversation:start',
    async (
      _event,
      config: SessionConfigIPC
    ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
      try {
        // Read settings for timeout
        const settings = await readSettings();
        const timeoutSeconds = settings.ollama?.timeoutSeconds ?? 180;

        // Create session with custom data for character config etc.
        const session = sessionManager.createSession({
          goal: config.goal,
          maxIterations: config.maxIterations,
          projectPath: config.projectPath,
          inkFilePath: config.inkFilePath,
          data: {
            characterConfig: config.characterConfig,  // Backward compat
            contactCharacterConfig: config.characterConfig,  // Alias for clarity
            playerCharacterConfig: config.playerCharacterConfig,
            promptLibrary: config.promptLibrary,
            createdKnots: [],
            modifiedKnots: [],
            timeoutSeconds,  // For system prompt
          },
        });

        console.log(`[Conversation] Started session: ${session.id}`);

        // Add initial user message
        sessionManager.addMessage(session.id, {
          role: 'user',
          content: `My goal: ${config.goal}`,
        });

        // Run the first turn asynchronously with a small delay to allow frontend to set session ID
        // This allows the frontend to set the session ID before updates arrive
        setTimeout(async () => {
          try {
            const engine = await getOrCreateEngine(
              session.id,
              config.ollamaBaseUrl,
              config.ollamaModel,
              config.ollamaOptions
            );
            console.log(`[Conversation] Running first turn for session: ${session.id}`);
            await engine.runConversationTurn(session.id, sessionManager);
          } catch (error) {
            console.error(`[Conversation] Error in first turn:`, error);
            sessionManager.errorSession(session.id, error instanceof Error ? error.message : 'Unknown error');
            notificationService.notifyConversationUpdate(session.id, {
              sessionId: session.id,
              status: 'error',
              iterationCount: 0,
              maxIterations: config.maxIterations,
              createdKnots: [],
              modifiedKnots: [],
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }, 100);

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
      const engine = await getOrCreateEngine(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
      return engine.runConversationTurn(sessionId, sessionManager);
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

      // Add user message
      sessionManager.addMessage(sessionId, { role: 'user', content: message });

      // Run next turn
      const engine = await getOrCreateEngine(sessionId, ollamaBaseUrl, ollamaModel, ollamaOptions);
      return engine.runConversationTurn(sessionId, sessionManager);
    }
  );

  // Get session state
  ipcMain.handle(
    'conversation:getState',
    async (_event, sessionId: string): Promise<ConversationSessionState | null> => {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return null;
      }

      const data = session.data as {
        createdKnots?: string[];
        modifiedKnots?: string[];
      };

      return {
        sessionId: session.id,
        status: session.status,
        goal: session.goal,
        messages: session.messages,
        iterationCount: session.iterationCount,
        maxIterations: session.maxIterations,
        createdKnots: data.createdKnots ?? [],
        modifiedKnots: data.modifiedKnots ?? [],
        error: session.errorMessage,
      };
    }
  );

  // Cancel a session
  ipcMain.handle('conversation:cancel', async (_event, sessionId: string): Promise<boolean> => {
    const result = sessionManager.cancelSession(sessionId);
    if (result) {
      const data = result.data as { createdKnots?: string[]; modifiedKnots?: string[] };
      notificationService.notifyConversationUpdate(sessionId, {
        sessionId,
        status: 'cancelled',
        iterationCount: result.iterationCount,
        maxIterations: result.maxIterations,
        createdKnots: data.createdKnots ?? [],
        modifiedKnots: data.modifiedKnots ?? [],
      });
    }
    return !!result;
  });

  // End/delete a session
  ipcMain.handle('conversation:end', async (_event, sessionId: string): Promise<boolean> => {
    cleanupSession(sessionId);
    return sessionManager.deleteSession(sessionId);
  });

  // List all sessions (optionally filtered by ink file)
  ipcMain.handle(
    'conversation:listSessions',
    async (_event, inkFilePath?: string): Promise<ConversationSessionState[]> => {
      const sessions = inkFilePath
        ? sessionManager.getSessionsByFile(inkFilePath)
        : sessionManager.getAllSessions();

      return sessions.map(session => {
        const data = session.data as {
          createdKnots?: string[];
          modifiedKnots?: string[];
        };

        return {
          sessionId: session.id,
          status: session.status,
          goal: session.goal,
          messages: session.messages,
          iterationCount: session.iterationCount,
          maxIterations: session.maxIterations,
          createdKnots: data.createdKnots ?? [],
          modifiedKnots: data.modifiedKnots ?? [],
          error: session.errorMessage,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
        };
      });
    }
  );
}
