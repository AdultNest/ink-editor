/**
 * AI Session Manager
 *
 * Manages conversation sessions for the AI auto-generation system.
 * Each session tracks messages, state, and created content.
 */

import type { CharacterAIConfig } from '../../renderer/ink/ai/characterConfig';
import type { ProjectPromptLibrary } from '../../renderer/services/promptLibrary.types';

/**
 * Ollama message format for chat API
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool calls made by the assistant */
  tool_calls?: OllamaToolCall[];
}

/**
 * Ollama tool call
 */
export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  result: string;
  error?: string;
}

/**
 * Session status
 */
export type SessionStatus = 'active' | 'completed' | 'error' | 'max_iterations' | 'cancelled';

/**
 * A conversation session with the AI
 */
export interface ConversationSession {
  /** Unique session ID */
  id: string;
  /** Chat messages in this session */
  messages: OllamaMessage[];
  /** The user-defined goal for this session */
  goal: string;
  /** Current iteration count */
  iterationCount: number;
  /** Maximum allowed iterations */
  maxIterations: number;
  /** Names of knots created during this session */
  createdKnots: string[];
  /** Names of knots modified during this session */
  modifiedKnots: string[];
  /** Session status */
  status: SessionStatus;
  /** Path to the project root */
  projectPath: string;
  /** Path to the ink file being edited */
  inkFilePath: string;
  /** Character AI configuration (if available) */
  characterConfig: CharacterAIConfig | null;
  /** Project prompt library (if available) */
  promptLibrary: ProjectPromptLibrary | null;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Pending image generations */
  pendingImages: string[];
}

/**
 * Configuration for creating a new session
 */
export interface SessionConfig {
  goal: string;
  maxIterations: number;
  projectPath: string;
  inkFilePath: string;
  characterConfig?: CharacterAIConfig | null;
  promptLibrary?: ProjectPromptLibrary | null;
}

// Session storage
const sessions = new Map<string, ConversationSession>();

// Session ID counter
let sessionIdCounter = 0;

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (++sessionIdCounter).toString(36);
  return `session_${timestamp}_${counter}`;
}

/**
 * Create a new conversation session
 */
export function createSession(config: SessionConfig): ConversationSession {
  const id = generateSessionId();
  const now = Date.now();

  const session: ConversationSession = {
    id,
    messages: [],
    goal: config.goal,
    iterationCount: 0,
    maxIterations: config.maxIterations,
    createdKnots: [],
    modifiedKnots: [],
    status: 'active',
    projectPath: config.projectPath,
    inkFilePath: config.inkFilePath,
    characterConfig: config.characterConfig ?? null,
    promptLibrary: config.promptLibrary ?? null,
    createdAt: now,
    lastActivityAt: now,
    pendingImages: [],
  };

  sessions.set(id, session);
  console.log(`[SessionManager] Created session: ${id}`);
  return session;
}

/**
 * Get a session by ID
 */
export function getSession(id: string): ConversationSession | undefined {
  return sessions.get(id);
}

/**
 * Update a session with partial data
 */
export function updateSession(
  id: string,
  updates: Partial<Omit<ConversationSession, 'id' | 'createdAt'>>
): ConversationSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    console.warn(`[SessionManager] Session not found: ${id}`);
    return undefined;
  }

  // Apply updates
  Object.assign(session, updates, { lastActivityAt: Date.now() });
  sessions.set(id, session);

  return session;
}

/**
 * Add a message to a session
 */
export function addMessage(id: string, message: OllamaMessage): ConversationSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    console.warn(`[SessionManager] Session not found: ${id}`);
    return undefined;
  }

  session.messages.push(message);
  session.lastActivityAt = Date.now();
  sessions.set(id, session);

  return session;
}

/**
 * Increment the iteration count for a session
 */
export function incrementIteration(id: string): ConversationSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    console.warn(`[SessionManager] Session not found: ${id}`);
    return undefined;
  }

  session.iterationCount++;
  session.lastActivityAt = Date.now();

  // Check if we've hit max iterations
  if (session.iterationCount >= session.maxIterations) {
    session.status = 'max_iterations';
  }

  sessions.set(id, session);
  return session;
}

/**
 * Mark a session as completed
 */
export function completeSession(id: string): ConversationSession | undefined {
  return updateSession(id, { status: 'completed' });
}

/**
 * Mark a session as errored
 */
export function errorSession(id: string, errorMessage: string): ConversationSession | undefined {
  return updateSession(id, { status: 'error', errorMessage });
}

/**
 * Mark a session as cancelled
 */
export function cancelSession(id: string): ConversationSession | undefined {
  return updateSession(id, { status: 'cancelled' });
}

/**
 * Add a created knot to the session
 */
export function addCreatedKnot(id: string, knotName: string): ConversationSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    return undefined;
  }

  if (!session.createdKnots.includes(knotName)) {
    session.createdKnots.push(knotName);
    session.lastActivityAt = Date.now();
    sessions.set(id, session);
  }

  return session;
}

/**
 * Add a modified knot to the session
 */
export function addModifiedKnot(id: string, knotName: string): ConversationSession | undefined {
  const session = sessions.get(id);
  if (!session) {
    return undefined;
  }

  if (!session.modifiedKnots.includes(knotName)) {
    session.modifiedKnots.push(knotName);
    session.lastActivityAt = Date.now();
    sessions.set(id, session);
  }

  return session;
}

/**
 * Delete a session
 */
export function deleteSession(id: string): boolean {
  const existed = sessions.has(id);
  sessions.delete(id);
  if (existed) {
    console.log(`[SessionManager] Deleted session: ${id}`);
  }
  return existed;
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): ConversationSession[] {
  return Array.from(sessions.values()).filter(s => s.status === 'active');
}

/**
 * Clean up old sessions (older than 1 hour)
 */
export function cleanupOldSessions(): number {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let cleanedCount = 0;

  for (const [id, session] of sessions) {
    if (session.lastActivityAt < oneHourAgo && session.status !== 'active') {
      sessions.delete(id);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[SessionManager] Cleaned up ${cleanedCount} old sessions`);
  }

  return cleanedCount;
}

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 30 * 60 * 1000);
