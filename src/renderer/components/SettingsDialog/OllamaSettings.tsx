/**
 * OllamaSettings component
 *
 * Form for configuring Ollama LLM settings.
 */

import { useState, useCallback } from 'react';
import type { OllamaSettings as OllamaSettingsType } from '../../../preload';
import { ConnectionStatus } from './ConnectionStatus';
import './SettingsDialog.css';

export interface OllamaSettingsProps {
  settings: OllamaSettingsType;
  onChange: (settings: Partial<OllamaSettingsType>) => void;
}

export function OllamaSettings({ settings, onChange }: OllamaSettingsProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setStatusMessage(undefined);

    try {
      const result = await window.electronAPI.testOllama(settings.baseUrl);

      if (result.success) {
        setIsConnected(true);
        setAvailableModels(result.models || []);
        setStatusMessage(`Connected - ${result.models?.length || 0} models available`);

        // Auto-select first model if none selected
        if (!settings.model && result.models && result.models.length > 0) {
          onChange({ model: result.models[0] });
        }
      } else {
        setIsConnected(false);
        setAvailableModels([]);
        setStatusMessage(result.error || 'Connection failed');
      }
    } catch (error) {
      setIsConnected(false);
      setAvailableModels([]);
      setStatusMessage(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setIsTesting(false);
    }
  }, [settings.baseUrl, settings.model, onChange]);

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">Ollama Settings</h3>
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
          <label className="settings-form__label" htmlFor="ollama-url">
            Server URL
          </label>
          <div className="settings-form__input-group">
            <input
              id="ollama-url"
              type="text"
              className="settings-form__input"
              value={settings.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434"
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
          <label className="settings-form__label" htmlFor="ollama-model">
            Model
          </label>
          {availableModels.length > 0 ? (
            <select
              id="ollama-model"
              className="settings-form__select"
              value={settings.model}
              onChange={(e) => onChange({ model: e.target.value })}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="ollama-model"
              type="text"
              className="settings-form__input"
              value={settings.model}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="llama3.2"
            />
          )}
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="ollama-temperature">
            Temperature
          </label>
          <div className="settings-form__slider-group">
            <input
              id="ollama-temperature"
              type="range"
              className="settings-form__slider"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
            />
            <span className="settings-form__slider-value">{settings.temperature}</span>
          </div>
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="ollama-tokens">
            Max Tokens
          </label>
          <input
            id="ollama-tokens"
            type="number"
            className="settings-form__input settings-form__input--small"
            value={settings.maxTokens}
            onChange={(e) => onChange({ maxTokens: parseInt(e.target.value, 10) || 2048 })}
            min="256"
            max="8192"
          />
        </div>
      </div>
    </div>
  );
}

export default OllamaSettings;
