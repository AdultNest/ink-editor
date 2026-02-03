/**
 * SessionsPanel component
 *
 * Sidebar panel displaying all AI conversation sessions.
 * Allows users to view, reopen, and manage sessions.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ConversationSessionState, ConversationSessionStatus } from '../../../preload';

import './SessionsPanel.css';

export interface SessionsPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback when panel is closed */
  onClose: () => void;
  /** Currently active session ID */
  currentSessionId: string | null;
  /** Callback when a session is selected */
  onSessionSelect: (sessionId: string) => void;
  /** Callback when a session is deleted */
  onSessionDelete: (sessionId: string) => void;
  /** Optional filter by ink file path */
  inkFilePath?: string;
}

/**
 * Format timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Get status display info
 */
function getStatusInfo(status: ConversationSessionStatus): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'sessions-status-active' };
    case 'completed':
      return { label: 'Completed', className: 'sessions-status-completed' };
    case 'error':
      return { label: 'Error', className: 'sessions-status-error' };
    case 'max_iterations':
      return { label: 'Max Iterations', className: 'sessions-status-max' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'sessions-status-cancelled' };
    default:
      return { label: status, className: '' };
  }
}

/**
 * Truncate goal text for display
 */
function truncateGoal(goal: string, maxLength: number = 50): string {
  if (goal.length <= maxLength) return goal;
  return goal.substring(0, maxLength) + '...';
}

export function SessionsPanel({
  isOpen,
  onClose,
  currentSessionId,
  onSessionSelect,
  onSessionDelete,
  inkFilePath,
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState<ConversationSessionState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedSessions = await window.electronAPI.listConversationSessions(inkFilePath);
      setSessions(loadedSessions);
    } catch (error) {
      console.error('[SessionsPanel] Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [inkFilePath]);

  // Load sessions when panel opens or ink file changes
  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, inkFilePath, loadSessions]);

  // Handle session selection
  const handleSessionClick = (sessionId: string) => {
    onSessionSelect(sessionId);
  };

  // Handle session deletion
  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (deleteConfirm !== sessionId) {
      setDeleteConfirm(sessionId);
      return;
    }

    try {
      await window.electronAPI.endConversationSession(sessionId);
      onSessionDelete(sessionId);
      await loadSessions();
    } catch (error) {
      console.error('[SessionsPanel] Failed to delete session:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Cancel delete confirmation
  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  if (!isOpen) return null;

  return (
    <div className="sessions-panel-overlay" onClick={onClose}>
      <div className="sessions-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sessions-panel-header">
          <h3 className="sessions-panel-title">AI Sessions</h3>
          <button className="sessions-panel-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="sessions-panel-content">
          {isLoading ? (
            <div className="sessions-panel-loading">
              <div className="sessions-panel-spinner" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="sessions-panel-empty">
              No AI sessions yet.
              <div className="sessions-panel-hint">
                Start a conversation with the AI Assistant to create a session.
              </div>
            </div>
          ) : (
            <div className="sessions-panel-list">
              {sessions.map((session) => {
                const statusInfo = getStatusInfo(session.status);
                const isCurrent = session.sessionId === currentSessionId;
                const isDeleting = deleteConfirm === session.sessionId;

                return (
                  <div
                    key={session.sessionId}
                    className={`sessions-panel-item ${isCurrent ? 'sessions-panel-item-current' : ''} ${isDeleting ? 'sessions-panel-item-deleting' : ''}`}
                    onClick={() => handleSessionClick(session.sessionId)}
                  >
                    <div className="sessions-panel-item-header">
                      <span className={`sessions-panel-status ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      {isCurrent && (
                        <span className="sessions-panel-current-badge">CURRENT</span>
                      )}
                      <span className="sessions-panel-time">
                        {formatRelativeTime(session.lastActivityAt || session.createdAt || Date.now())}
                      </span>
                    </div>

                    <div className="sessions-panel-item-goal" title={session.goal}>
                      {truncateGoal(session.goal)}
                    </div>

                    <div className="sessions-panel-item-meta">
                      <span className="sessions-panel-iterations">
                        {session.iterationCount}/{session.maxIterations} turns
                      </span>
                      {session.createdKnots.length > 0 && (
                        <span className="sessions-panel-knots sessions-panel-knots-created">
                          +{session.createdKnots.length} knots
                        </span>
                      )}
                      {session.modifiedKnots.length > 0 && (
                        <span className="sessions-panel-knots sessions-panel-knots-modified">
                          ~{session.modifiedKnots.length} modified
                        </span>
                      )}
                    </div>

                    {session.error && (
                      <div className="sessions-panel-item-error" title={session.error}>
                        {truncateGoal(session.error, 40)}
                      </div>
                    )}

                    <div className="sessions-panel-item-actions">
                      {isDeleting ? (
                        <>
                          <button
                            className="sessions-panel-btn sessions-panel-btn-confirm"
                            onClick={(e) => handleDelete(session.sessionId, e)}
                          >
                            Confirm
                          </button>
                          <button
                            className="sessions-panel-btn sessions-panel-btn-cancel"
                            onClick={handleCancelDelete}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="sessions-panel-btn sessions-panel-btn-delete"
                          onClick={(e) => handleDelete(session.sessionId, e)}
                          title="Delete session"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sessions-panel-footer">
          <button className="sessions-panel-refresh" onClick={loadSessions}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionsPanel;
