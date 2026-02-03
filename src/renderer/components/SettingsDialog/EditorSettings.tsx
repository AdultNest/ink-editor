/**
 * EditorSettings component
 *
 * Settings panel for editor configuration (history length, etc.)
 */

import type { EditorSettings as EditorSettingsType } from '../../../preload';
import './SettingsDialog.css';

export interface EditorSettingsProps {
  settings: EditorSettingsType;
  onChange: (updates: Partial<EditorSettingsType>) => void;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettingsType = {
  maxHistoryLength: 1000,
};

export function EditorSettings({ settings, onChange }: EditorSettingsProps) {
  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">Undo/Redo History</h3>
      </div>

      <div className="settings-form">
        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="maxHistoryLength">
            Maximum History Length
          </label>
          <div className="settings-form__slider-group">
            <input
              id="maxHistoryLength"
              type="range"
              className="settings-form__slider"
              value={settings.maxHistoryLength}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                onChange({ maxHistoryLength: value });
              }}
              min={50}
              max={5000}
              step={50}
            />
            <input
              type="number"
              className="settings-form__input settings-form__input--small"
              value={settings.maxHistoryLength}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 10) {
                  onChange({ maxHistoryLength: Math.min(10000, value) });
                }
              }}
              min={10}
              max={10000}
            />
          </div>
        </div>

        <p className="settings-form__hint">
          Maximum number of history entries to keep per file. The history tree preserves
          all branches, allowing you to navigate to any previous state. Older entries on
          inactive branches are removed first when the limit is reached.
        </p>
      </div>
    </div>
  );
}

export default EditorSettings;
