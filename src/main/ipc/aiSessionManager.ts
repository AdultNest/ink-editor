/**
 * AI Session Manager - Backward Compatibility Re-exports
 *
 * This file maintains backward compatibility with the old API.
 * New code should import directly from '../services/ai'.
 *
 * @deprecated Use imports from '../services/ai' instead
 */

// Re-export types from the new services layer
export type {
  ConversationSession,
  SessionConfig,
  SessionStatus,
  LLMMessage as OllamaMessage,
  LLMToolCall as OllamaToolCall,
  ToolResult,
} from '../services/ai';

// Re-export session manager functions via the default instance
import { getSessionManager } from '../services/ai';

const manager = getSessionManager();

/**
 * Create a new conversation session
 * @deprecated Use SessionManager class directly
 */
export function createSession(config: import('../services/ai').SessionConfig) {
  return manager.createSession(config);
}

/**
 * Get a session by ID
 * @deprecated Use SessionManager class directly
 */
export function getSession(id: string) {
  return manager.getSession(id);
}

/**
 * Update a session with partial data
 * @deprecated Use SessionManager class directly
 */
export function updateSession(
  id: string,
  updates: Partial<Omit<import('../services/ai').ConversationSession, 'id' | 'createdAt'>>
) {
  return manager.updateSession(id, updates);
}

/**
 * Add a message to a session
 * @deprecated Use SessionManager class directly
 */
export function addMessage(id: string, message: import('../services/ai').LLMMessage) {
  return manager.addMessage(id, message);
}

/**
 * Increment the iteration count for a session
 * @deprecated Use SessionManager class directly
 */
export function incrementIteration(id: string) {
  return manager.incrementIteration(id);
}

/**
 * Mark a session as completed
 * @deprecated Use SessionManager class directly
 */
export function completeSession(id: string) {
  return manager.completeSession(id);
}

/**
 * Mark a session as errored
 * @deprecated Use SessionManager class directly
 */
export function errorSession(id: string, errorMessage: string) {
  return manager.errorSession(id, errorMessage);
}

/**
 * Mark a session as cancelled
 * @deprecated Use SessionManager class directly
 */
export function cancelSession(id: string) {
  return manager.cancelSession(id);
}

/**
 * Add a created knot to the session
 * @deprecated Use SessionManager.addToSessionDataArray() instead
 */
export function addCreatedKnot(id: string, knotName: string) {
  return manager.addToSessionDataArray(id, 'createdKnots', knotName);
}

/**
 * Add a modified knot to the session
 * @deprecated Use SessionManager.addToSessionDataArray() instead
 */
export function addModifiedKnot(id: string, knotName: string) {
  return manager.addToSessionDataArray(id, 'modifiedKnots', knotName);
}

/**
 * Delete a session
 * @deprecated Use SessionManager class directly
 */
export function deleteSession(id: string) {
  return manager.deleteSession(id);
}

/**
 * Get all active sessions
 * @deprecated Use SessionManager class directly
 */
export function getActiveSessions() {
  return manager.getActiveSessions();
}

/**
 * Clean up old sessions
 * @deprecated Use SessionManager class directly
 */
export function cleanupOldSessions() {
  return manager.cleanupOldSessions();
}
