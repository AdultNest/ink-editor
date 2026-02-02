/**
 * GenerateDialog component
 *
 * Modal dialog for creating new AI-assisted conversations.
 * For continuing from existing nodes, use the AI tab in the node detail panel.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppSettings } from '../../../preload';
import {
  buildNewConversationPrompt,
  parseLLMResponse,
  llmResponseToInk,
  EXAMPLE_PROMPTS,
} from '../ai';
import type { CharacterAIConfig } from '../ai/characterConfig';
import { buildSystemPromptWithMood } from '../ai/characterConfig';
import './GenerateDialog.css';

export interface GenerateDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current application settings */
  settings: AppSettings;
  /** Character AI configuration for generation */
  characterConfig?: CharacterAIConfig | null;
  /** Callback when content is generated */
  onGenerate: (inkContent: string) => void;
  /** Callback when dialog is closed */
  onClose: () => void;
}

export function GenerateDialog({
  isOpen,
  settings,
  characterConfig,
  onGenerate,
  onClose,
}: GenerateDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [sceneSetting, setSceneSetting] = useState('');
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const hasMoods = characterConfig && characterConfig.moodSets.length > 0;

  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setError(null);
      setGeneratedContent(null);
      setIsGenerating(false);

      // Focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        handleGenerate();
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

  // Use example prompt
  const handleUseExample = useCallback((example: string) => {
    setPrompt(example);
    textareaRef.current?.focus();
  }, []);

  // Generate content
  const handleGenerate = useCallback(async () => {
    const requestId = Date.now().toString(36);
    console.log(`[GenerateDialog:${requestId}] Starting new conversation generation`);

    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (!settings.ollama?.enabled) {
      setError('Ollama is not enabled. Please configure it in Settings.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);

    try {
      console.log(`[GenerateDialog:${requestId}] Prompt: ${prompt.substring(0, 100)}...`);
      console.log(`[GenerateDialog:${requestId}] Character: ${characterName || '(none)'}, Scene: ${sceneSetting || '(none)'}`);
      if (characterConfig) {
        console.log(`[GenerateDialog:${requestId}] Using character config: ${characterConfig.characterId}, mood: ${selectedMood || 'default'}`);
      }

      // Build generation prompts
      const { systemPrompt: baseSystemPrompt, userPrompt } = buildNewConversationPrompt({
        userPrompt: prompt,
        characterName: characterName || undefined,
        sceneSetting: sceneSetting || undefined,
      });

      // Enhance system prompt with character mood if available
      const systemPrompt = buildSystemPromptWithMood(
        baseSystemPrompt,
        characterConfig || null,
        selectedMood || undefined
      );

      console.log(`[GenerateDialog:${requestId}] System prompt: ${systemPrompt.length} chars`);
      console.log(`[GenerateDialog:${requestId}] User prompt: ${userPrompt}`);

      // Call Ollama
      const result = await window.electronAPI.generateWithOllama({
        baseUrl: settings.ollama.baseUrl,
        model: settings.ollama.model,
        prompt: userPrompt,
        systemPrompt,
        temperature: settings.ollama.temperature,
        maxTokens: settings.ollama.maxTokens,
        format: "json"
      });

      console.log(`[GenerateDialog:${requestId}] Response success: ${result.success}`);

      if (!result.success) {
        console.error(`[GenerateDialog:${requestId}] Error: ${result.error}`);
        throw new Error(result.error || 'Generation failed');
      }

      if (!result.response) {
        throw new Error('No response from LLM');
      }

      console.log(`[GenerateDialog:${requestId}] Response: ${result.response.substring(0, 200)}...`);

      // Parse the response
      const parsed = parseLLMResponse(result.response);
      if (!parsed) {
        console.error(`[GenerateDialog:${requestId}] Parse failed, raw:`, result.response);
        throw new Error('Failed to parse LLM response. Check console for details.');
      }

      console.log(`[GenerateDialog:${requestId}] Parsed ${parsed.knots.length} knots`);

      // Convert to Ink format
      const inkContent = llmResponseToInk(parsed);
      setGeneratedContent(inkContent);
      console.log(`[GenerateDialog:${requestId}] Done`);
    } catch (err) {
      console.error(`[GenerateDialog:${requestId}] Error:`, err);
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, settings, characterName, sceneSetting, characterConfig, selectedMood]);

  // Insert generated content
  const handleInsert = useCallback(() => {
    if (generatedContent) {
      onGenerate(generatedContent);
      onClose();
    }
  }, [generatedContent, onGenerate, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="generate-dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-dialog-title"
    >
      <div className="generate-dialog" ref={dialogRef}>
        <div className="generate-dialog__header">
          <h2 id="generate-dialog-title" className="generate-dialog__title">
            New Conversation
          </h2>
          <button
            type="button"
            className="generate-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="generate-dialog__content">
          {/* Optional context fields */}
          <div className="generate-dialog__context">
            <input
              type="text"
              className="generate-dialog__input"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Character name (optional)"
            />
            <input
              type="text"
              className="generate-dialog__input"
              value={sceneSetting}
              onChange={(e) => setSceneSetting(e.target.value)}
              placeholder="Scene/setting (optional)"
            />
          </div>

          {/* Prompt input */}
          <div className="generate-dialog__prompt-section">
            <label className="generate-dialog__label" htmlFor="generate-prompt">
              Describe the conversation:
            </label>
            <textarea
              ref={textareaRef}
              id="generate-prompt"
              className="generate-dialog__textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A friendly barista greets a customer..."
              rows={3}
            />
          </div>

          {/* Example prompts */}
          <div className="generate-dialog__examples">
            <span className="generate-dialog__examples-label">Examples:</span>
            {EXAMPLE_PROMPTS.map((example, index) => (
              <button
                key={index}
                type="button"
                className="generate-dialog__example"
                onClick={() => handleUseExample(example)}
              >
                {example}
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && <div className="generate-dialog__error">{error}</div>}

          {/* Generated content preview */}
          {generatedContent && (
            <div className="generate-dialog__preview">
              <label className="generate-dialog__label">Generated:</label>
              <pre className="generate-dialog__preview-content">{generatedContent}</pre>
            </div>
          )}
        </div>

        <div className="generate-dialog__actions">
          <button
            type="button"
            className="generate-dialog__button generate-dialog__button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          {generatedContent ? (
            <>
              <button
                type="button"
                className="generate-dialog__button generate-dialog__button--secondary"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                Regenerate
              </button>
              <button
                type="button"
                className="generate-dialog__button generate-dialog__button--primary"
                onClick={handleInsert}
              >
                Insert
              </button>
            </>
          ) : (
            <button
              type="button"
              className="generate-dialog__button generate-dialog__button--primary"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GenerateDialog;
