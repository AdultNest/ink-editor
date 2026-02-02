/**
 * MethodsConfigEditor component
 *
 * Editor for methods.conf files that displays available external methods
 * with reference counts showing how many times each method is used across ink files.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './MethodsConfigEditor.css';

export interface AvailableMethod {
  name: string;
  params: string[];
  description?: string;
}

interface MethodWithRefs extends AvailableMethod {
  referenceCount: number;
  files: string[];
}

export interface MethodsConfigEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function MethodsConfigEditor({ filePath, fileName, onDirtyChange }: MethodsConfigEditorProps) {
  const [methods, setMethods] = useState<AvailableMethod[]>([]);
  const [methodsWithRefs, setMethodsWithRefs] = useState<MethodWithRefs[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notify parent of dirty state changes (use ref to avoid infinite loops)
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const prevDirtyRef = useRef(isDirty);
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      onDirtyChangeRef.current?.(isDirty);
    }
  }, [isDirty]);

  // New method dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<AvailableMethod | null>(null);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodParams, setNewMethodParams] = useState('');
  const [newMethodDescription, setNewMethodDescription] = useState('');

  // Load the methods config
  useEffect(() => {
    async function loadConfig() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const config = JSON.parse(content);
        const loadedMethods = config.availableMethods || [];
        setMethods(loadedMethods);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load config');
      } finally {
        setIsLoading(false);
      }
    }

    loadConfig();
  }, [filePath]);

  // Scan all ink files for method references
  useEffect(() => {
    async function scanForReferences() {
      if (methods.length === 0) {
        setMethodsWithRefs([]);
        return;
      }

      try {
        // Get the project root (parent directory of methods.conf)
        const pathSeparator = filePath.includes('\\') ? '\\' : '/';
        const pathParts = filePath.split(pathSeparator);
        const projectRoot = pathParts.slice(0, -1).join(pathSeparator);

        // Find all ink files in the project
        const inkFiles = await findInkFiles(projectRoot, pathSeparator);

        // Count references for each method
        const methodRefs: MethodWithRefs[] = methods.map(method => ({
          ...method,
          referenceCount: 0,
          files: [],
        }));

        for (const inkFile of inkFiles) {
          try {
            const content = await window.electronAPI.readFile(inkFile);
            const relativePath = inkFile.replace(projectRoot + pathSeparator, '');

            for (const methodRef of methodRefs) {
              // Count how many times the method is called (not just declared)
              const callPattern = new RegExp(`${methodRef.name}\\s*\\(`, 'g');
              const matches = content.match(callPattern);
              if (matches && matches.length > 0) {
                methodRef.referenceCount += matches.length;
                if (!methodRef.files.includes(relativePath)) {
                  methodRef.files.push(relativePath);
                }
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }

        setMethodsWithRefs(methodRefs);
      } catch (err) {
        console.error('Failed to scan for references:', err);
        // Still show methods without reference counts
        setMethodsWithRefs(methods.map(m => ({ ...m, referenceCount: 0, files: [] })));
      }
    }

    scanForReferences();
  }, [methods, filePath]);

  // Recursively find all ink files in a directory
  async function findInkFiles(dir: string, sep: string): Promise<string[]> {
    const inkFiles: string[] = [];

    try {
      const entries = await window.electronAPI.readDir(dir);

      for (const entry of entries) {
        if (entry.isDirectory) {
          // Skip hidden directories and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const subFiles = await findInkFiles(entry.path, sep);
            inkFiles.push(...subFiles);
          }
        } else if (entry.name.endsWith('.ink')) {
          inkFiles.push(entry.path);
        }
      }
    } catch {
      // Skip directories that can't be read
    }

    return inkFiles;
  }

  // Save the config
  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const config = { availableMethods: methods };
      await window.electronAPI.writeFile(filePath, JSON.stringify(config, null, 2));
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, methods]);

  // Add or update a method
  const handleSaveMethod = useCallback(() => {
    const name = newMethodName.trim();
    const params = newMethodParams.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const description = newMethodDescription.trim() || undefined;

    if (!name) return;

    // Check for duplicate names (except when editing the same method)
    const isDuplicate = methods.some(m =>
      m.name === name && (!editingMethod || editingMethod.name !== name)
    );
    if (isDuplicate) {
      setError(`Method "${name}" already exists`);
      return;
    }

    const newMethod: AvailableMethod = { name, params, description };

    if (editingMethod) {
      // Update existing method
      setMethods(prev => prev.map(m =>
        m.name === editingMethod.name ? newMethod : m
      ));
    } else {
      // Add new method
      setMethods(prev => [...prev, newMethod]);
    }

    setIsDirty(true);
    closeDialog();
  }, [newMethodName, newMethodParams, newMethodDescription, editingMethod, methods]);

  // Delete a method
  const handleDeleteMethod = useCallback((methodName: string) => {
    setMethods(prev => prev.filter(m => m.name !== methodName));
    setIsDirty(true);
  }, []);

  // Open edit dialog
  const openEditDialog = useCallback((method: AvailableMethod) => {
    setEditingMethod(method);
    setNewMethodName(method.name);
    setNewMethodParams(method.params.join(', '));
    setNewMethodDescription(method.description || '');
    setShowAddDialog(true);
  }, []);

  // Open add dialog
  const openAddDialog = useCallback(() => {
    setEditingMethod(null);
    setNewMethodName('');
    setNewMethodParams('');
    setNewMethodDescription('');
    setShowAddDialog(true);
  }, []);

  // Close dialog
  const closeDialog = useCallback(() => {
    setShowAddDialog(false);
    setEditingMethod(null);
    setNewMethodName('');
    setNewMethodParams('');
    setNewMethodDescription('');
    setError(null);
  }, []);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) save();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save, isDirty]);

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  const isValidMethodName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newMethodName.trim());
  const canSubmit = newMethodName.trim() && isValidMethodName;

  return (
    <div className="content-view methods-config-editor">
      {/* Toolbar */}
      <div className="methods-config-toolbar">
        <div className="methods-config-title">
          <span className="methods-config-icon">⚙️</span>
          <span>Available Methods</span>
          <span className="methods-config-count">{methods.length}</span>
        </div>

        <div className="methods-config-actions">
          {isDirty && <span className="methods-config-dirty">Modified</span>}

          <button
            className="methods-config-btn"
            onClick={openAddDialog}
            title="Add new method"
          >
            + Add Method
          </button>

          <button
            className="methods-config-btn methods-config-btn-primary"
            onClick={save}
            disabled={!isDirty || isSaving}
            title="Save (Ctrl+S)"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="methods-config-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Methods list */}
      <div className="methods-config-content">
        {methodsWithRefs.length === 0 ? (
          <div className="methods-config-empty">
            <p>No methods defined yet.</p>
            <p className="methods-config-hint">
              Click "Add Method" to define an external function that can be used in ink files.
            </p>
          </div>
        ) : (
          <div className="methods-config-list">
            {methodsWithRefs.map(method => (
              <div key={method.name} className="methods-config-item">
                <div className="methods-config-item-header">
                  <div className="methods-config-item-name">
                    <code>{method.name}</code>
                    <span className="methods-config-item-params">
                      ({method.params.join(', ')})
                    </span>
                  </div>
                  <div className="methods-config-item-actions">
                    <span
                      className={`methods-config-item-refs ${method.referenceCount > 0 ? 'has-refs' : ''}`}
                      title={method.files.length > 0 ? `Used in: ${method.files.join(', ')}` : 'Not used'}
                    >
                      {method.referenceCount} ref{method.referenceCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      className="methods-config-item-btn"
                      onClick={() => openEditDialog(method)}
                      title="Edit method"
                    >
                      ✏️
                    </button>
                    <button
                      className="methods-config-item-btn methods-config-item-btn-danger"
                      onClick={() => handleDeleteMethod(method.name)}
                      title="Delete method"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {method.description && (
                  <div className="methods-config-item-description">
                    {method.description}
                  </div>
                )}
                {method.files.length > 0 && (
                  <div className="methods-config-item-files">
                    Used in: {method.files.map((f, i) => (
                      <span key={f} className="methods-config-item-file">
                        {f}{i < method.files.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit dialog */}
      {showAddDialog && (
        <div className="methods-config-dialog-overlay" onClick={closeDialog}>
          <div className="methods-config-dialog" onClick={e => e.stopPropagation()}>
            <div className="methods-config-dialog-header">
              <h3>{editingMethod ? 'Edit Method' : 'Add New Method'}</h3>
              <button onClick={closeDialog}>&times;</button>
            </div>
            <div className="methods-config-dialog-content">
              <label className="methods-config-dialog-label">
                Method Name
                <input
                  type="text"
                  className="methods-config-dialog-input"
                  value={newMethodName}
                  onChange={e => setNewMethodName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && canSubmit) handleSaveMethod();
                    if (e.key === 'Escape') closeDialog();
                  }}
                  placeholder="e.g., SetStoryFlag"
                  autoFocus
                />
              </label>
              <label className="methods-config-dialog-label">
                Parameters (comma-separated)
                <input
                  type="text"
                  className="methods-config-dialog-input"
                  value={newMethodParams}
                  onChange={e => setNewMethodParams(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && canSubmit) handleSaveMethod();
                    if (e.key === 'Escape') closeDialog();
                  }}
                  placeholder="e.g., flagName, value"
                />
              </label>
              <label className="methods-config-dialog-label">
                Description (optional)
                <input
                  type="text"
                  className="methods-config-dialog-input"
                  value={newMethodDescription}
                  onChange={e => setNewMethodDescription(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && canSubmit) handleSaveMethod();
                    if (e.key === 'Escape') closeDialog();
                  }}
                  placeholder="e.g., Sets a story flag for tracking progress"
                />
              </label>
              <div className="methods-config-dialog-preview">
                <span className="methods-config-dialog-preview-label">Preview:</span>
                <code>EXTERNAL {newMethodName || 'MethodName'}({newMethodParams || 'params'})</code>
              </div>
            </div>
            <div className="methods-config-dialog-actions">
              <button
                className="methods-config-btn"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button
                className="methods-config-btn methods-config-btn-primary"
                onClick={handleSaveMethod}
                disabled={!canSubmit}
              >
                {editingMethod ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MethodsConfigEditor;
