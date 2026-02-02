/**
 * RenameDialog component
 *
 * A modal dialog for renaming files with reference updating support.
 * Shows found references with checkboxes to allow selective updates.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { FileReference, ReferenceUpdate } from '../../types/electron.d.ts';
import './RenameDialog.css';

/**
 * Grouped reference by file
 */
interface GroupedReference {
  filePath: string;
  fileName: string;
  references: Array<FileReference & { selected: boolean; id: string }>;
}

export interface RenameDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The current file path being renamed */
  filePath: string;
  /** The current file name */
  fileName: string;
  /** The project root path for searching references */
  projectPath: string;
  /** Callback when rename is confirmed */
  onRename: (newName: string, referencesToUpdate: ReferenceUpdate[]) => Promise<void>;
  /** Callback when dialog is canceled */
  onCancel: () => void;
}

/**
 * RenameDialog component
 *
 * Provides a two-step rename process:
 * 1. Enter new filename
 * 2. Review and select which references to update
 */
export function RenameDialog({
  isOpen,
  filePath,
  fileName,
  projectPath,
  onRename,
  onCancel,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(fileName);
  const [isSearching, setIsSearching] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [references, setReferences] = useState<GroupedReference[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens/closes or file changes
  useEffect(() => {
    if (isOpen) {
      setNewName(fileName);
      setReferences([]);
      setHasSearched(false);
      setError(null);
      setIsSearching(false);
      setIsRenaming(false);
      // Focus input after a short delay to ensure it's mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, fileName]);

  // Select text in input on focus
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Select the filename without extension
      const dotIndex = fileName.lastIndexOf('.');
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [isOpen, fileName]);

  // Check if name has changed
  const hasNameChanged = useMemo(() => {
    return newName.trim() !== '' && newName !== fileName;
  }, [newName, fileName]);

  // Search for references
  const handleSearchReferences = useCallback(async () => {
    if (!hasNameChanged) return;

    setIsSearching(true);
    setError(null);

    try {
      // Search for the old filename (without path)
      const foundReferences = await window.electronAPI.findReferences(
        projectPath,
        fileName,
        ['.json', '.ink', '.conf', '.txt']
      );

      // Filter out references in the file being renamed itself
      const filteredRefs = foundReferences.filter(ref => ref.filePath !== filePath);

      // Group references by file
      const grouped = new Map<string, GroupedReference>();

      filteredRefs.forEach((ref, index) => {
        const existing = grouped.get(ref.filePath);
        const refWithSelection = {
          ...ref,
          selected: true,
          id: `ref-${index}`,
        };

        if (existing) {
          existing.references.push(refWithSelection);
        } else {
          const pathParts = ref.filePath.split(/[/\\]/);
          grouped.set(ref.filePath, {
            filePath: ref.filePath,
            fileName: pathParts[pathParts.length - 1],
            references: [refWithSelection],
          });
        }
      });

      setReferences(Array.from(grouped.values()));
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search for references');
    } finally {
      setIsSearching(false);
    }
  }, [hasNameChanged, projectPath, fileName, filePath]);

  // Toggle reference selection
  const toggleReference = useCallback((fileIndex: number, refIndex: number) => {
    setReferences(prev => {
      const updated = [...prev];
      updated[fileIndex] = {
        ...updated[fileIndex],
        references: updated[fileIndex].references.map((ref, i) =>
          i === refIndex ? { ...ref, selected: !ref.selected } : ref
        ),
      };
      return updated;
    });
  }, []);

  // Toggle all references in a file
  const toggleFileReferences = useCallback((fileIndex: number) => {
    setReferences(prev => {
      const updated = [...prev];
      const allSelected = updated[fileIndex].references.every(r => r.selected);
      updated[fileIndex] = {
        ...updated[fileIndex],
        references: updated[fileIndex].references.map(ref => ({
          ...ref,
          selected: !allSelected,
        })),
      };
      return updated;
    });
  }, []);

  // Count selected references
  const selectedCount = useMemo(() => {
    return references.reduce(
      (count, group) => count + group.references.filter(r => r.selected).length,
      0
    );
  }, [references]);

  // Handle rename
  const handleRename = useCallback(async () => {
    if (!hasNameChanged) return;

    setIsRenaming(true);
    setError(null);

    try {
      // Build reference updates from selected references
      const updates: ReferenceUpdate[] = [];

      for (const group of references) {
        for (const ref of group.references) {
          if (ref.selected) {
            updates.push({
              filePath: group.filePath,
              oldText: fileName,
              newText: newName.trim(),
            });
          }
        }
      }

      // Deduplicate updates (same file, same replacement)
      const uniqueUpdates = updates.filter(
        (update, index, self) =>
          index === self.findIndex(
            u => u.filePath === update.filePath && u.oldText === update.oldText
          )
      );

      await onRename(newName.trim(), uniqueUpdates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename file');
      setIsRenaming(false);
    }
  }, [hasNameChanged, newName, fileName, references, onRename]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        if (!hasSearched && hasNameChanged) {
          handleSearchReferences();
        } else if (hasSearched && hasNameChanged) {
          handleRename();
        }
      }
    },
    [onCancel, hasSearched, hasNameChanged, handleSearchReferences, handleRename]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  // Get relative path for display
  const getRelativePath = useCallback((fullPath: string) => {
    if (fullPath.startsWith(projectPath)) {
      return fullPath.slice(projectPath.length + 1);
    }
    return fullPath;
  }, [projectPath]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="rename-dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
    >
      <div className="rename-dialog">
        <h2 id="rename-dialog-title" className="rename-dialog__title">
          Rename "{fileName}"
        </h2>

        {/* New name input */}
        <div className="rename-dialog__input-section">
          <label htmlFor="rename-input" className="rename-dialog__label">
            New name:
          </label>
          <input
            ref={inputRef}
            id="rename-input"
            type="text"
            className="rename-dialog__input"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setHasSearched(false);
              setReferences([]);
            }}
            disabled={isSearching || isRenaming}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="rename-dialog__error">
            {error}
          </div>
        )}

        {/* Search button or references list */}
        {!hasSearched ? (
          <div className="rename-dialog__search-section">
            <p className="rename-dialog__info">
              Search for references to this file before renaming to update them automatically.
            </p>
            <button
              type="button"
              className="rename-dialog__button rename-dialog__button--search"
              onClick={handleSearchReferences}
              disabled={!hasNameChanged || isSearching}
            >
              {isSearching ? 'Searching...' : 'Search for References'}
            </button>
          </div>
        ) : (
          <div className="rename-dialog__references-section">
            {references.length === 0 ? (
              <p className="rename-dialog__no-refs">
                No references found. You can proceed with renaming.
              </p>
            ) : (
              <>
                <p className="rename-dialog__refs-info">
                  Found {references.reduce((c, g) => c + g.references.length, 0)} reference(s) in {references.length} file(s).
                  Select which ones to update:
                </p>
                <div className="rename-dialog__references-list">
                  {references.map((group, fileIndex) => (
                    <div key={group.filePath} className="rename-dialog__file-group">
                      <div
                        className="rename-dialog__file-header"
                        onClick={() => toggleFileReferences(fileIndex)}
                      >
                        <input
                          type="checkbox"
                          checked={group.references.every(r => r.selected)}
                          onChange={() => toggleFileReferences(fileIndex)}
                          className="rename-dialog__checkbox"
                        />
                        <span className="rename-dialog__file-name" title={getRelativePath(group.filePath)}>
                          {group.fileName}
                        </span>
                        <span className="rename-dialog__ref-count">
                          ({group.references.filter(r => r.selected).length}/{group.references.length})
                        </span>
                      </div>
                      <div className="rename-dialog__ref-items">
                        {group.references.map((ref, refIndex) => (
                          <label
                            key={ref.id}
                            className="rename-dialog__ref-item"
                          >
                            <input
                              type="checkbox"
                              checked={ref.selected}
                              onChange={() => toggleReference(fileIndex, refIndex)}
                              className="rename-dialog__checkbox"
                            />
                            <span className="rename-dialog__line-number">
                              Line {ref.lineNumber}:
                            </span>
                            <span className="rename-dialog__line-content" title={ref.lineContent}>
                              {ref.lineContent}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="rename-dialog__actions">
          <button
            type="button"
            className="rename-dialog__button rename-dialog__button--cancel"
            onClick={onCancel}
            disabled={isRenaming}
          >
            Cancel
          </button>
          {hasSearched && (
            <button
              type="button"
              className="rename-dialog__button rename-dialog__button--confirm"
              onClick={handleRename}
              disabled={!hasNameChanged || isRenaming}
            >
              {isRenaming
                ? 'Renaming...'
                : selectedCount > 0
                  ? `Rename & Update ${selectedCount} Reference${selectedCount !== 1 ? 's' : ''}`
                  : 'Rename'
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RenameDialog;
