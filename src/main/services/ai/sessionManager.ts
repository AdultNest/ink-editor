/**
 * Session Manager
 *
 * Pure functions for managing conversation session state.
 * Designed to be testable with no external dependencies.
 */

import type {
  ConversationSession,
  SessionConfig,
  SessionStatus,
  LLMMessage,
} from './interfaces';

/**
 * Session storage interface
 * Can be implemented with Map, database, or mock for testing
 */
export interface ISessionStorage {
  get(id: string): ConversationSession | undefined;
  set(id: string, session: ConversationSession): void;
  delete(id: string): boolean;
  has(id: string): boolean;
  values(): IterableIterator<ConversationSession>;
}

/**
 * In-memory session storage implementation
 */
export class InMemorySessionStorage implements ISessionStorage {
  private sessions = new Map<string, ConversationSession>();

  get(id: string): ConversationSession | undefined {
    return this.sessions.get(id);
  }

  set(id: string, session: ConversationSession): void {
    this.sessions.set(id, session);
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  values(): IterableIterator<ConversationSession> {
    return this.sessions.values();
  }
}

/**
 * Session manager class
 */
export class SessionManager {
  private sessionIdCounter = 0;

  constructor(private storage: ISessionStorage = new InMemorySessionStorage()) {}

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.sessionIdCounter).toString(36);
    return `session_${timestamp}_${counter}`;
  }

  /**
   * Create a new conversation session
   */
  createSession(config: SessionConfig): ConversationSession {
    const id = this.generateSessionId();
    const now = Date.now();

    const session: ConversationSession = {
      id,
      messages: [],
      goal: config.goal,
      iterationCount: 0,
      maxIterations: config.maxIterations,
      status: 'active',
      projectPath: config.projectPath,
      inkFilePath: config.inkFilePath,
      createdAt: now,
      lastActivityAt: now,
      data: config.data ?? {},
    };

    this.storage.set(id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): ConversationSession | undefined {
    return this.storage.get(id);
  }

  /**
   * Update a session with partial data
   */
  updateSession(
    id: string,
    updates: Partial<Omit<ConversationSession, 'id' | 'createdAt'>>
  ): ConversationSession | undefined {
    const session = this.storage.get(id);
    if (!session) {
      return undefined;
    }

    Object.assign(session, updates, { lastActivityAt: Date.now() });
    this.storage.set(id, session);
    return session;
  }

  /**
   * Add a message to a session
   */
  addMessage(id: string, message: LLMMessage): ConversationSession | undefined {
    const session = this.storage.get(id);
    if (!session) {
      return undefined;
    }

    session.messages.push(message);
    session.lastActivityAt = Date.now();
    this.storage.set(id, session);
    return session;
  }

  /**
   * Increment the iteration count for a session
   */
  incrementIteration(id: string): ConversationSession | undefined {
    const session = this.storage.get(id);
    if (!session) {
      return undefined;
    }

    session.iterationCount++;
    session.lastActivityAt = Date.now();

    if (session.iterationCount >= session.maxIterations) {
      session.status = 'max_iterations';
    }

    this.storage.set(id, session);
    return session;
  }

  /**
   * Update session status
   */
  setStatus(id: string, status: SessionStatus, errorMessage?: string): ConversationSession | undefined {
    const updates: Partial<ConversationSession> = { status };
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    return this.updateSession(id, updates);
  }

  /**
   * Mark a session as completed
   */
  completeSession(id: string): ConversationSession | undefined {
    return this.setStatus(id, 'completed');
  }

  /**
   * Mark a session as errored
   */
  errorSession(id: string, errorMessage: string): ConversationSession | undefined {
    return this.setStatus(id, 'error', errorMessage);
  }

  /**
   * Mark a session as cancelled
   */
  cancelSession(id: string): ConversationSession | undefined {
    return this.setStatus(id, 'cancelled');
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    return this.storage.delete(id);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ConversationSession[] {
    const active: ConversationSession[] = [];
    for (const session of this.storage.values()) {
      if (session.status === 'active') {
        active.push(session);
      }
    }
    return active;
  }

  /**
   * Get all sessions (active and finished)
   */
  getAllSessions(): ConversationSession[] {
    return Array.from(this.storage.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  /**
   * Get sessions filtered by ink file path
   */
  getSessionsByFile(inkFilePath: string): ConversationSession[] {
    const sessions: ConversationSession[] = [];
    for (const session of this.storage.values()) {
      if (session.inkFilePath === inkFilePath) {
        sessions.push(session);
      }
    }
    return sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  /**
   * Update session custom data
   */
  updateSessionData(
    id: string,
    dataUpdates: Record<string, unknown>
  ): ConversationSession | undefined {
    const session = this.storage.get(id);
    if (!session) {
      return undefined;
    }

    session.data = { ...session.data, ...dataUpdates };
    session.lastActivityAt = Date.now();
    this.storage.set(id, session);
    return session;
  }

  /**
   * Add item to array in session data
   */
  addToSessionDataArray(
    id: string,
    key: string,
    value: unknown
  ): ConversationSession | undefined {
    const session = this.storage.get(id);
    if (!session) {
      return undefined;
    }

    const arr = (session.data[key] as unknown[]) ?? [];
    if (!arr.includes(value)) {
      arr.push(value);
      session.data[key] = arr;
      session.lastActivityAt = Date.now();
      this.storage.set(id, session);
    }

    return session;
  }

  /**
   * Clean up old sessions (older than specified milliseconds)
   */
  cleanupOldSessions(maxAgeMs: number = 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleanedCount = 0;

    const toDelete: string[] = [];
    for (const session of this.storage.values()) {
      if (session.lastActivityAt < cutoff && session.status !== 'active') {
        toDelete.push(session.id);
      }
    }

    for (const id of toDelete) {
      this.storage.delete(id);
      cleanedCount++;
    }

    return cleanedCount;
  }
}

/**
 * Default singleton instance for production use
 * Tests should create their own instances with mock storage
 */
let defaultInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!defaultInstance) {
    defaultInstance = new SessionManager();
  }
  return defaultInstance;
}

/**
 * Reset the default instance (for testing)
 */
export function resetSessionManager(): void {
  defaultInstance = null;
}
