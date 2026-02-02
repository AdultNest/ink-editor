/**
 * SettingsDialog component
 *
 * Modal dialog for configuring Ollama and ComfyUI settings.
 * Features a tabbed interface with connection testing.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppSettings, OllamaSettings as OllamaSettingsType, ComfyUISettings as ComfyUISettingsType } from '../../../preload';
import { OllamaSettings } from './OllamaSettings';
import { ComfyUISettings } from './ComfyUISettings';
import { TutorialPanel } from './TutorialPanel';
import './SettingsDialog.css';

export type SettingsTab = 'ollama' | 'comfyui' | 'guide';

export interface SettingsDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current application settings */
  settings: AppSettings;
  /** Callback when settings change */
  onSettingsChange: (settings: AppSettings) => void;
  /** Callback when dialog is closed */
  onClose: () => void;
}

const DEFAULT_OLLAMA_SETTINGS: OllamaSettingsType = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
  temperature: 0.7,
  maxTokens: 2048,
};

const DEFAULT_COMFYUI_SETTINGS: ComfyUISettingsType = {
  enabled: false,
  baseUrl: 'http://localhost:8188',
  checkpointModel: '',
  defaultSteps: 20,
  defaultWidth: 512,
  defaultHeight: 512,
};

export function SettingsDialog({
  isOpen,
  settings,
  onSettingsChange,
  onClose,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ollama');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Get current settings with defaults
  const ollamaSettings = settings.ollama || DEFAULT_OLLAMA_SETTINGS;
  const comfyuiSettings = settings.comfyui || DEFAULT_COMFYUI_SETTINGS;

  // Handle Ollama settings change
  const handleOllamaChange = useCallback(
    (updates: Partial<OllamaSettingsType>) => {
      const newOllamaSettings = { ...ollamaSettings, ...updates };
      onSettingsChange({ ...settings, ollama: newOllamaSettings });
    },
    [settings, ollamaSettings, onSettingsChange]
  );

  // Handle ComfyUI settings change
  const handleComfyUIChange = useCallback(
    (updates: Partial<ComfyUISettingsType>) => {
      const newComfyUISettings = { ...comfyuiSettings, ...updates };
      onSettingsChange({ ...settings, comfyui: newComfyUISettings });
    },
    [settings, comfyuiSettings, onSettingsChange]
  );

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Handle click outside to close
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Focus dialog when opened
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="settings-dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="settings-dialog" ref={dialogRef} tabIndex={-1}>
        <div className="settings-dialog__header">
          <h2 id="settings-dialog-title" className="settings-dialog__title">
            AI Settings
          </h2>
          <button
            type="button"
            className="settings-dialog__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="settings-dialog__tabs">
          <button
            type="button"
            className={`settings-dialog__tab ${activeTab === 'ollama' ? 'settings-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('ollama')}
          >
            Ollama
          </button>
          <button
            type="button"
            className={`settings-dialog__tab ${activeTab === 'comfyui' ? 'settings-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('comfyui')}
          >
            ComfyUI
          </button>
          <button
            type="button"
            className={`settings-dialog__tab ${activeTab === 'guide' ? 'settings-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            Setup Guide
          </button>
        </div>

        <div className="settings-dialog__content">
          {activeTab === 'ollama' && (
            <OllamaSettings settings={ollamaSettings} onChange={handleOllamaChange} />
          )}
          {activeTab === 'comfyui' && (
            <ComfyUISettings settings={comfyuiSettings} onChange={handleComfyUIChange} />
          )}
          {activeTab === 'guide' && <TutorialPanel />}
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
