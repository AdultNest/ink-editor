/**
 * CharacterJsonEditor component
 *
 * Special form-based editor for character JSON files (in "characters" folder).
 */

import { useState, useEffect, useCallback } from 'react';
import './JsonEditor.css';

export interface CharacterJsonEditorProps {
  filePath: string;
  fileName: string;
}

interface CharacterJson {
  isMainCharacter: boolean;
  contactID: string;
  contactName: string;
  contactNickname: string;
  contactNicknameShort: string;
  contactLastName?: string;
  profilePicturePath: string;
  characterColorHex?: string;
  contactDescription?: string;
  contactPersonality?: string;
  contactHistory?: string;
  showContactFromStart?: boolean;
}

const DEFAULT_CHARACTER: CharacterJson = {
  isMainCharacter: false,
  contactID: '',
  contactName: '',
  contactNickname: '',
  contactNicknameShort: '',
  profilePicturePath: '',
};

export function CharacterJsonEditor({ filePath, fileName }: CharacterJsonEditorProps) {
  const [data, setData] = useState<CharacterJson>(DEFAULT_CHARACTER);
  const [originalData, setOriginalData] = useState<CharacterJson>(DEFAULT_CHARACTER);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(data) !== JSON.stringify(originalData);

  // Load file
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(content);
        const charData = { ...DEFAULT_CHARACTER, ...parsed };
        if (isMounted) {
          setData(charData);
          setOriginalData(charData);
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

  const handleChange = useCallback(<K extends keyof CharacterJson>(field: K, value: CharacterJson[K]) => {
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
        <span style={{ fontWeight: 600, color: '#d4d4d4' }}>Character Editor</span>
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
          <div className="json-form-section-title">Identity</div>

          <div className="json-form-field">
            <div className="json-form-checkbox-wrapper">
              <input
                type="checkbox"
                className="json-form-checkbox"
                checked={data.isMainCharacter}
                onChange={(e) => handleChange('isMainCharacter', e.target.checked)}
                id="isMainCharacter"
              />
              <label htmlFor="isMainCharacter" className="json-form-checkbox-label">
                Is Main Character (Player)
              </label>
            </div>
            <div className="json-form-hint">Only one character can be the main/player character</div>
          </div>

          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Contact ID</label>
            <input
              type="text"
              className="json-form-input"
              value={data.contactID}
              onChange={(e) => handleChange('contactID', e.target.value)}
              placeholder="character_id"
            />
            <div className="json-form-hint">Unique ID used in conversations (don't change after creation)</div>
          </div>

          <div className="json-form-row">
            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Full Name</label>
              <input
                type="text"
                className="json-form-input"
                value={data.contactName}
                onChange={(e) => handleChange('contactName', e.target.value)}
                placeholder="Sarah Johnson"
              />
            </div>
            <div className="json-form-field">
              <label className="json-form-label">Last Name</label>
              <input
                type="text"
                className="json-form-input"
                value={data.contactLastName || ''}
                onChange={(e) => handleChange('contactLastName', e.target.value)}
                placeholder="Johnson"
              />
            </div>
          </div>

          <div className="json-form-row">
            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Nickname</label>
              <input
                type="text"
                className="json-form-input"
                value={data.contactNickname}
                onChange={(e) => handleChange('contactNickname', e.target.value)}
                placeholder="Sarah"
              />
              <div className="json-form-hint">How they appear in conversations</div>
            </div>
            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Short Nickname</label>
              <input
                type="text"
                className="json-form-input"
                value={data.contactNicknameShort}
                onChange={(e) => handleChange('contactNicknameShort', e.target.value)}
                placeholder="Sarah"
              />
              <div className="json-form-hint">Short version for UI elements</div>
            </div>
          </div>
        </div>

        <div className="json-form-section">
          <div className="json-form-section-title">Appearance</div>

          <div className="json-form-row">
            <div className="json-form-field">
              <label className="json-form-label json-form-label-required">Profile Picture</label>
              <input
                type="text"
                className="json-form-input"
                value={data.profilePicturePath}
                onChange={(e) => handleChange('profilePicturePath', e.target.value)}
                placeholder="sarah.png"
              />
              <div className="json-form-hint">Image filename (832x832 recommended)</div>
            </div>
            <div className="json-form-field">
              <label className="json-form-label">Character Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={data.characterColorHex || '#ffffff'}
                  onChange={(e) => handleChange('characterColorHex', e.target.value)}
                  style={{ width: 40, height: 32, padding: 0, border: 'none', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="json-form-input"
                  value={data.characterColorHex || ''}
                  onChange={(e) => handleChange('characterColorHex', e.target.value)}
                  placeholder="#ff6b35"
                  style={{ maxWidth: 120 }}
                />
              </div>
            </div>
          </div>

          <div className="json-form-field">
            <div className="json-form-checkbox-wrapper">
              <input
                type="checkbox"
                className="json-form-checkbox"
                checked={data.showContactFromStart || false}
                onChange={(e) => handleChange('showContactFromStart', e.target.checked)}
                id="showFromStart"
              />
              <label htmlFor="showFromStart" className="json-form-checkbox-label">
                Show Contact From Start
              </label>
            </div>
          </div>
        </div>

        <div className="json-form-section">
          <div className="json-form-section-title">Character Details (Optional)</div>

          <div className="json-form-field">
            <label className="json-form-label">Description</label>
            <textarea
              className="json-form-input json-form-textarea"
              value={data.contactDescription || ''}
              onChange={(e) => handleChange('contactDescription', e.target.value)}
              placeholder="A brief description of this character..."
            />
          </div>

          <div className="json-form-field">
            <label className="json-form-label">Personality</label>
            <textarea
              className="json-form-input json-form-textarea"
              value={data.contactPersonality || ''}
              onChange={(e) => handleChange('contactPersonality', e.target.value)}
              placeholder="Character's personality traits..."
            />
          </div>

          <div className="json-form-field">
            <label className="json-form-label">History</label>
            <textarea
              className="json-form-input json-form-textarea"
              value={data.contactHistory || ''}
              onChange={(e) => handleChange('contactHistory', e.target.value)}
              placeholder="Character's background and history..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterJsonEditor;
