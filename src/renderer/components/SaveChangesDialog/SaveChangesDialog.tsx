/**
 * SaveChangesDialog component
 *
 * A modal dialog for prompting the user to save changes before closing a file.
 * Provides three options: Save, Don't Save, and Cancel.
 */

import { useCallback, useEffect, useRef } from 'react';
import './SaveChangesDialog.css';

export interface SaveChangesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The file name to display */
  fileName: string;
  /** Whether a save operation is in progress */
  isSaving?: boolean;
  /** Callback when the user clicks Save */
  onSave: () => void;
  /** Callback when the user clicks Don't Save */
  onDontSave: () => void;
  /** Callback when the user clicks Cancel or closes the dialog */
  onCancel: () => void;
}

/**
 * SaveChangesDialog component
 *
 * Displays a modal dialog asking the user whether to save changes before closing.
 * Supports keyboard navigation (Enter for Save, Escape for Cancel).
 */
export function SaveChangesDialog({
  isOpen,
  fileName,
  isSaving = false,
  onSave,
  onDontSave,
  onCancel,
}: SaveChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the save button when dialog opens
  useEffect(() => {
    if (isOpen && saveButtonRef.current) {
      saveButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isSaving) return;

      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter') {
        onSave();
      }
    },
    [onSave, onCancel, isSaving]
  );

  // Handle click outside to cancel
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget && !isSaving) {
        onCancel();
      }
    },
    [onCancel, isSaving]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="save-changes-dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-changes-dialog-title"
    >
      <div className="save-changes-dialog" ref={dialogRef}>
        <h2 id="save-changes-dialog-title" className="save-changes-dialog__title">
          Save Changes?
        </h2>
        <p className="save-changes-dialog__message">
          Do you want to save the changes you made to <strong>{fileName}</strong>?
        </p>
        <p className="save-changes-dialog__warning">
          Your changes will be lost if you don't save them.
        </p>
        <div className="save-changes-dialog__actions">
          <button
            type="button"
            className="save-changes-dialog__button save-changes-dialog__button--dont-save"
            onClick={onDontSave}
            disabled={isSaving}
          >
            Don't Save
          </button>
          <div className="save-changes-dialog__actions-right">
            <button
              type="button"
              className="save-changes-dialog__button save-changes-dialog__button--cancel"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              ref={saveButtonRef}
              className="save-changes-dialog__button save-changes-dialog__button--save"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SaveChangesDialog;
