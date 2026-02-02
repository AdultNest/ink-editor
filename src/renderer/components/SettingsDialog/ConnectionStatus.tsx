/**
 * ConnectionStatus component
 *
 * Displays a connection status indicator (green/red dot) with text.
 */

import './SettingsDialog.css';

export interface ConnectionStatusProps {
  /** Whether the connection is successful */
  isConnected: boolean;
  /** Whether a connection test is in progress */
  isTesting?: boolean;
  /** Optional status message */
  message?: string;
}

export function ConnectionStatus({
  isConnected,
  isTesting = false,
  message,
}: ConnectionStatusProps) {
  if (isTesting) {
    return (
      <div className="connection-status connection-status--testing">
        <span className="connection-status__dot connection-status__dot--testing" />
        <span className="connection-status__text">Testing connection...</span>
      </div>
    );
  }

  return (
    <div className={`connection-status ${isConnected ? 'connection-status--connected' : 'connection-status--disconnected'}`}>
      <span
        className={`connection-status__dot ${
          isConnected ? 'connection-status__dot--connected' : 'connection-status__dot--disconnected'
        }`}
      />
      <span className="connection-status__text">
        {message || (isConnected ? 'Connected' : 'Not connected')}
      </span>
    </div>
  );
}

export default ConnectionStatus;
