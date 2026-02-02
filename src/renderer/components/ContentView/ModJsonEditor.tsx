/**
 * ModJsonEditor component
 *
 * Special form-based editor for mod.json files.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './JsonEditor.css';

export interface ModJsonEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface ModJson {
  modId: string;
  modName: string;
  version: string;
  author: string;
  description: string;
  headerImage?: string;
}

const DEFAULT_MOD: ModJson = {
  modId: '',
  modName: '',
  version: '1.0.0',
  author: '',
  description: '',
  headerImage: '',
};

export function ModJsonEditor({ filePath, fileName, onDirtyChange }: ModJsonEditorProps) {
  const [data, setData] = useState<ModJson>(DEFAULT_MOD);
  const [originalData, setOriginalData] = useState<ModJson>(DEFAULT_MOD);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(data) !== JSON.stringify(originalData);

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

  // Load file
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(content);
        const modData = { ...DEFAULT_MOD, ...parsed };
        if (isMounted) {
          setData(modData);
          setOriginalData(modData);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setIsLoading(false);
        }
      }
    }

    loadFile();
    return () => { isMounted = false; };
  }, [filePath]);

  const handleChange = useCallback((field: keyof ModJson, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const content = JSON.stringify(data, null, 4);
      await window.electronAPI.writeFile(filePath, content);
      setOriginalData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, data]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isDirty]);

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-view content-view-error">
        <span className="content-view-error-icon">!</span>
        <span className="content-view-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="content-view json-form-editor">
      <div className="json-editor-toolbar">
        <span style={{ fontWeight: 600, color: '#d4d4d4' }}>Mod Configuration</span>
        <div className="json-editor-actions">
          {isDirty && <span className="json-editor-dirty">Modified</span>}
          <button
            className="json-editor-btn json-editor-btn-primary"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <span className="json-editor-filename">{fileName}</span>
      </div>

      <div className="json-form-content">
        <div className="json-form-section">
          <div className="json-form-section-title">Basic Information</div>

          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Mod ID</label>
            <input
              type="text"
              className="json-form-input"
              value={data.modId}
              onChange={(e) => handleChange('modId', e.target.value)}
              placeholder="your-unique-mod-id"
            />
            <div className="json-form-hint">Unique identifier (lowercase, no spaces, use hyphens)</div>
          </div>

          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Mod Name</label>
            <input
              type="text"
              className="json-form-input"
              value={data.modName}
              onChange={(e) => handleChange('modName', e.target.value)}
              placeholder="Your Mod Display Name"
            />
            <div className="json-form-hint">Display name shown in the game</div>
          </div>

          <div className="json-form-row">
            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Version</label>
              <input
                type="text"
                className="json-form-input"
                value={data.version}
                onChange={(e) => handleChange('version', e.target.value)}
                placeholder="1.0.0"
              />
              <div className="json-form-hint">Semantic versioning (e.g., 1.0.0)</div>
            </div>

            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Author</label>
              <input
                type="text"
                className="json-form-input"
                value={data.author}
                onChange={(e) => handleChange('author', e.target.value)}
                placeholder="Your Name"
              />
            </div>
          </div>

          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Description</label>
            <textarea
              className="json-form-input json-form-textarea"
              value={data.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="A brief description of your mod story"
            />
          </div>
        </div>

        <div className="json-form-section">
          <div className="json-form-section-title">Assets</div>

          <div className="json-form-field">
            <label className="json-form-label">Header Image</label>
            <input
              type="text"
              className="json-form-input"
              value={data.headerImage || ''}
              onChange={(e) => handleChange('headerImage', e.target.value)}
              placeholder="header.png"
            />
            <div className="json-form-hint">Banner image filename (1600x400 recommended) - Optional</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModJsonEditor;
