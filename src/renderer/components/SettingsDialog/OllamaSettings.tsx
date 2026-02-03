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
          <div className="settings-form__slider-group">
            <input
              id="ollama-tokens"
              type="range"
              className="settings-form__slider"
              min="2048"
              max="16384"
              step="2048"
              value={settings.maxTokens}
              onChange={(e) => onChange({ maxTokens: parseInt(e.target.value, 10) })}
            />
            <span className="settings-form__slider-value">{settings.maxTokens}</span>
          </div>
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="ollama-timeout">
            Timeout
          </label>
          <div className="settings-form__slider-group">
            <input
              id="ollama-timeout"
              type="range"
              className="settings-form__slider"
              min="1"
              max="10"
              step="0.5"
              value={(settings.timeoutSeconds ?? 180) / 60}
              onChange={(e) => onChange({ timeoutSeconds: Math.round(parseFloat(e.target.value) * 60) })}
            />
            <span className="settings-form__slider-value">{((settings.timeoutSeconds ?? 180) / 60).toFixed(1)} min</span>
          </div>
          <span className="settings-form__hint">
            Maximum time to wait for a response (increase for slower models)
          </span>
        </div>

        <div className="settings-form__divider" />

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="ollama-summarize-threshold">
            Summarize After
          </label>
          <div className="settings-form__slider-group">
            <input
              id="ollama-summarize-threshold"
              type="range"
              className="settings-form__slider"
              min="10"
              max="100"
              step="5"
              value={settings.summarizeAfterMessages ?? 30}
              onChange={(e) => onChange({ summarizeAfterMessages: parseInt(e.target.value, 10) })}
            />
            <span className="settings-form__slider-value">{settings.summarizeAfterMessages ?? 30} msgs</span>
          </div>
          <span className="settings-form__hint">
            Compress older messages after this many to prevent context overflow
          </span>
        </div>

        <div className="settings-form__row">
          <label className="settings-form__label" htmlFor="ollama-keep-recent">
            Keep Recent
          </label>
          <div className="settings-form__slider-group">
            <input
              id="ollama-keep-recent"
              type="range"
              className="settings-form__slider"
              min="5"
              max="30"
              step="1"
              value={settings.keepRecentMessages ?? 10}
              onChange={(e) => onChange({ keepRecentMessages: parseInt(e.target.value, 10) })}
            />
            <span className="settings-form__slider-value">{settings.keepRecentMessages ?? 10} msgs</span>
          </div>
          <span className="settings-form__hint">
            Number of recent messages to keep verbatim when summarizing
          </span>
        </div>
      </div>
    </div>
  );
}

export default OllamaSettings;
