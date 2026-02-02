/**
 * ComfyUISettings component
 *
 * Form for configuring ComfyUI image generation settings.
 */

import { useState, useCallback } from 'react';
import type { ComfyUISettings as ComfyUISettingsType } from '../../../preload';
import { ConnectionStatus } from './ConnectionStatus';
import './SettingsDialog.css';

export interface ComfyUISettingsProps {
  settings: ComfyUISettingsType;
  onChange: (settings: Partial<ComfyUISettingsType>) => void;
}

export function ComfyUISettings({ settings, onChange }: ComfyUISettingsProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [availableCheckpoints, setAvailableCheckpoints] = useState<string[]>([]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setStatusMessage(undefined);

    try {
      const result = await window.electronAPI.testComfyUI(settings.baseUrl);

      if (result.success) {
        setIsConnected(true);
        setAvailableCheckpoints(result.checkpoints || []);
        setStatusMessage(`Connected - ${result.checkpoints?.length || 0} checkpoints available`);

        // Auto-select first checkpoint if none selected
        if (!settings.checkpointModel && result.checkpoints && result.checkpoints.length > 0) {
          onChange({ checkpointModel: result.checkpoints[0] });
        }
      } else {
        setIsConnected(false);
        setAvailableCheckpoints([]);
        setStatusMessage(result.error || 'Connection failed');
      }
    } catch (error) {
      setIsConnected(false);
      setAvailableCheckpoints([]);
      setStatusMessage(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setIsTesting(false);
    }
  }, [settings.baseUrl, settings.checkpointModel, onChange]);

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">ComfyUI Settings</h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span className="settings-toggle__label">Enabled</span>
        </label>
      </div>

      <div className="settings-form">
        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="comfyui-url">
            Server URL
          </label>
          <div className="settings-form__input-group">
            <input
              id="comfyui-url"
              type="text"
              className="settings-form__input"
              value={settings.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder="http://localhost:8188"
            />
            <button
              type="button"
              className="settings-form__button"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? 'Testing...' : 'Test'}
            </button>
          </div>
        </div>

        <ConnectionStatus
          isConnected={isConnected}
          isTesting={isTesting}
          message={statusMessage}
        />

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="comfyui-checkpoint">
            Checkpoint Model
          </label>
          {availableCheckpoints.length > 0 ? (
            <select
              id="comfyui-checkpoint"
              className="settings-form__select"
              value={settings.checkpointModel}
              onChange={(e) => onChange({ checkpointModel: e.target.value })}
            >
              <option value="">Select a checkpoint...</option>
              {availableCheckpoints.map((checkpoint) => (
                <option key={checkpoint} value={checkpoint}>
                  {checkpoint}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="comfyui-checkpoint"
              type="text"
              className="settings-form__input"
              value={settings.checkpointModel}
              onChange={(e) => onChange({ checkpointModel: e.target.value })}
              placeholder="v1-5-pruned-emaonly.safetensors"
            />
          )}
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="comfyui-steps">
            Default Steps
          </label>
          <input
            id="comfyui-steps"
            type="number"
            className="settings-form__input settings-form__input--small"
            value={settings.defaultSteps}
            onChange={(e) => onChange({ defaultSteps: parseInt(e.target.value, 10) || 20 })}
            min="1"
            max="150"
          />
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label">Default Size</label>
          <div className="settings-form__size-inputs">
            <input
              type="number"
              className="settings-form__input settings-form__input--small"
              value={settings.defaultWidth}
              onChange={(e) => onChange({ defaultWidth: parseInt(e.target.value, 10) || 512 })}
              min="64"
              max="2048"
              step="64"
              placeholder="Width"
            />
            <span className="settings-form__size-separator">x</span>
            <input
              type="number"
              className="settings-form__input settings-form__input--small"
              value={settings.defaultHeight}
              onChange={(e) => onChange({ defaultHeight: parseInt(e.target.value, 10) || 512 })}
              min="64"
              max="2048"
              step="64"
              placeholder="Height"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComfyUISettings;
