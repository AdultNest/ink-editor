/**
 * ConfirmDialog component
 *
 * A simple modal dialog for confirming destructive actions.
 */

import { useCallback, useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Title of the dialog */
  title: string;
  /** Message to display */
  message: string;
  /** Text for the confirm button */
  confirmText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Whether the confirm action is destructive (shows red button) */
  isDestructive?: boolean;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback when canceled or dialog is closed */
  onCancel: () => void;
}

/**
 * ConfirmDialog component
 *
 * Displays a modal dialog asking the user to confirm an action.
 * Supports keyboard navigation (Enter to confirm, Escape to cancel).
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter') {
        onConfirm();
      }
    },
    [onConfirm, onCancel]
  );

  // Handle click outside to close
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="confirm-dialog" ref={dialogRef}>
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={`confirm-dialog__button confirm-dialog__button--confirm ${
              isDestructive ? 'confirm-dialog__button--destructive' : ''
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
