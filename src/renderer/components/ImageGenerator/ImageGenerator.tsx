/**
 * ImageGenerator component (renamed from ImagePreviewGenerator)
 *
 * A two-stage image generation component:
 * 1. Quick preview (256px, base64, not saved) for fast iteration
 * 2. Full render (512px+) when user confirms - optionally saved to disk
 *
 * Allows users to quickly iterate through seeds before committing to a full render.
 * Includes "Compose" button to open PromptComposer for building complex prompts.
 */

import { useState, useCallback } from 'react';
import type { CharacterAppearance, GeneratedPrompt } from '../../services';
import type { CharacterAIConfig } from '../../ink/ai/characterConfig';
import { PromptComposerDialog } from '../PromptComposer';
import './ImageGenerator.css';

export interface ImageGeneratorProps {
  /** Positive prompt for image generation */
  positivePrompt: string;
  /** Negative prompt for image generation */
  negativePrompt: string;
  /** Project root path for workflow files */
  projectPath: string;
  /** Destination folder for saved images (required if saveToDisk is true) */
  destFolder?: string;
  /** Filename for saved image without extension (required if saveToDisk is true) */
  destFilename?: string;
  /** Callback when image is successfully rendered and saved */
  onImageSaved?: (savedPath: string) => void;
  /** Optional placeholder text */
  placeholder?: string;
  /** Whether to save rendered images to disk (default: true) */
  saveToDisk?: boolean;
  /** Whether to show the compose button */
  showComposeButton?: boolean;
  /** Character appearance for regional prompting (used by composer) */
  appearance?: CharacterAppearance;
  /** Full character AI config for prompt sets and mood sets (used by composer) */
  characterConfig?: CharacterAIConfig | null;
  /** Callback when prompt changes via composer */
  onPromptChange?: (prompt: GeneratedPrompt) => void;
}

type GeneratorState = 'idle' | 'generating_preview' | 'preview_ready' | 'generating_render' | 'complete';

export function ImageGenerator({
  positivePrompt,
  negativePrompt,
  projectPath,
  destFolder,
  destFilename,
  onImageSaved,
  placeholder = 'Click to generate a preview',
  saveToDisk = true,
  showComposeButton = false,
  appearance,
  characterConfig,
  onPromptChange,
}: ImageGeneratorProps) {
  const [state, setState] = useState<GeneratorState>('idle');
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [renderBase64, setRenderBase64] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // Store composed prompt for generation
  const [composedPrompt, setComposedPrompt] = useState<GeneratedPrompt | null>(null);

  // Use composed prompt if available, otherwise use props
  const effectivePositivePrompt = composedPrompt?.positive || positivePrompt;
  const effectiveNegativePrompt = composedPrompt?.negative || negativePrompt;

  // Handle composed prompt from dialog
  const handleComposedPrompt = useCallback((prompt: GeneratedPrompt) => {
    setComposedPrompt(prompt);
    onPromptChange?.(prompt);
  }, [onPromptChange]);

  // Determine if we can actually save (need destination info)
  const canSaveToDisk = saveToDisk && destFolder && destFilename;

  // Generate a new preview with a random seed
  const generatePreview = useCallback(async () => {
    setState('generating_preview');
    setError(null);
    setPreviewBase64(null);
    setRenderBase64(null);
    setSavedImagePath(null);

    try {
      const settings = await window.electronAPI.getSettings();
      const comfyui = settings.comfyui;

      if (!comfyui?.enabled || !comfyui?.baseUrl || !comfyui?.checkpointModel) {
        setError('ComfyUI is not configured. Please configure it in Settings.');
        setState('idle');
        return;
      }

      // Generate random seed (ComfyUI uses int64, JS max safe int is 2^53-1)
      const seed = Math.floor(Math.random() * 9007199254740991);
      setCurrentSeed(seed);

      // Use configured dimensions for seed consistency between preview and render
      const width = comfyui.defaultWidth || 512;
      const height = comfyui.defaultHeight || 512;

      // Queue preview generation
      const genResult = await window.electronAPI.generateWithComfyUI({
        baseUrl: comfyui.baseUrl,
        prompt: effectivePositivePrompt,
        negativePrompt: effectiveNegativePrompt,
        checkpointModel: comfyui.checkpointModel,
        steps: Math.min(comfyui.defaultSteps || 20, 15), // Fewer steps for preview
        width,
        height,
        seed,
        projectPath,
        workflowType: 'preview',
      });

      if (!genResult.success || !genResult.promptId) {
        setError(genResult.error || 'Failed to start preview generation');
        setState('idle');
        return;
      }

      // Poll for completion
      await pollForCompletion(comfyui.baseUrl, genResult.promptId, 'preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview generation failed');
      setState('idle');
    }
  }, [effectivePositivePrompt, effectiveNegativePrompt, projectPath]);

  // Render the full image with the same seed
  const confirmAndRender = useCallback(async () => {
    if (currentSeed === null) return;

    setState('generating_render');
    setError(null);

    try {
      const settings = await window.electronAPI.getSettings();
      const comfyui = settings.comfyui;

      if (!comfyui?.enabled || !comfyui?.baseUrl || !comfyui?.checkpointModel) {
        setError('ComfyUI is not configured.');
        setState('preview_ready');
        return;
      }

      // Use same dimensions as preview for seed consistency
      const width = comfyui.defaultWidth || 512;
      const height = comfyui.defaultHeight || 512;

      // Queue full render with same seed and dimensions
      const genResult = await window.electronAPI.generateWithComfyUI({
        baseUrl: comfyui.baseUrl,
        prompt: effectivePositivePrompt,
        negativePrompt: effectiveNegativePrompt,
        checkpointModel: comfyui.checkpointModel,
        steps: comfyui.defaultSteps || 20,
        width,
        height,
        seed: currentSeed,
        projectPath,
        workflowType: 'render',
      });

      if (!genResult.success || !genResult.promptId) {
        setError(genResult.error || 'Failed to start render');
        setState('preview_ready');
        return;
      }

      // Poll for completion
      await pollForCompletion(comfyui.baseUrl, genResult.promptId, 'render');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
      setState('preview_ready');
    }
  }, [effectivePositivePrompt, effectiveNegativePrompt, projectPath, currentSeed]);

  // Poll ComfyUI for generation completion
  const pollForCompletion = useCallback(async (
    baseUrl: string,
    promptId: string,
    type: 'preview' | 'render'
  ) => {
    const pollInterval = 500;
    const maxPolls = 240; // 2 minutes
    let polls = 0;

    const poll = async (): Promise<void> => {
      polls++;
      const status = await window.electronAPI.getComfyUIStatus(baseUrl, promptId);

      if (status.status === 'completed' && status.imageFilename) {
        if (type === 'preview') {
          // Fetch as base64 for preview via IPC (avoids CORS issues)
          const imageResult = await window.electronAPI.fetchComfyUIImageBase64(
            baseUrl,
            status.imageFilename,
            status.imageSubfolder,
            status.imageType
          );

          if (imageResult.success && imageResult.base64) {
            setPreviewBase64(imageResult.base64);
            setState('preview_ready');
          } else {
            setError(imageResult.error || 'Failed to load preview image');
            setState('idle');
          }
        } else {
          // Full render completed
          if (canSaveToDisk) {
            // Download and save to disk
            const result = await window.electronAPI.downloadComfyUIImage(
              baseUrl,
              status.imageFilename,
              destFolder!,
              `${destFilename}.png`
            );

            if (result.success && result.savedPath) {
              setSavedImagePath(result.savedPath);
              setState('complete');
              onImageSaved?.(result.savedPath);
            } else {
              setError(result.error || 'Failed to save image');
              setState('preview_ready');
            }
          } else {
            // Just fetch as base64 without saving to disk
            const imageResult = await window.electronAPI.fetchComfyUIImageBase64(
              baseUrl,
              status.imageFilename,
              status.imageSubfolder,
              status.imageType
            );

            if (imageResult.success && imageResult.base64) {
              setRenderBase64(imageResult.base64);
              setState('complete');
            } else {
              setError(imageResult.error || 'Failed to load rendered image');
              setState('preview_ready');
            }
          }
        }
      } else if (status.status === 'error' || !status.success) {
        setError(status.error || 'Generation failed');
        setState(type === 'preview' ? 'idle' : 'preview_ready');
      } else if (polls < maxPolls) {
        setTimeout(poll, pollInterval);
      } else {
        setError('Generation timed out');
        setState(type === 'preview' ? 'idle' : 'preview_ready');
      }
    };

    await poll();
  }, [canSaveToDisk, destFolder, destFilename, onImageSaved]);

  // Reset to idle state
  const reset = useCallback(() => {
    setState('idle');
    setPreviewBase64(null);
    setRenderBase64(null);
    setSavedImagePath(null);
    setCurrentSeed(null);
    setError(null);
  }, []);

  // Get the image source to display based on current state
  const getImageSrc = (): string | null => {
    // For preview states, always use base64 (never local-file)
    if (state === 'preview_ready' || state === 'generating_render') {
      return previewBase64;
    }
    // For complete state, use the saved file if available, otherwise render base64
    if (state === 'complete') {
      if (savedImagePath) {
        return window.electronAPI.getLocalFileUrl(savedImagePath);
      }
      if (renderBase64) {
        return renderBase64;
      }
    }
    // Fallback to base64 if available
    if (previewBase64) {
      return previewBase64;
    }
    return null;
  };

  const imageSrc = getImageSrc();
  const isGenerating = state === 'generating_preview' || state === 'generating_render';
  const hasPreview = state === 'preview_ready' || state === 'generating_render' || state === 'complete';

  // Determine click action based on state
  const handleDisplayClick = () => {
    if (state === 'idle') {
      generatePreview();
    } else if (state === 'preview_ready') {
      confirmAndRender();
    } else if (state === 'complete') {
      generatePreview();
    }
  };

  const isClickable = state === 'idle' || state === 'preview_ready' || state === 'complete';

  // Clear composed prompt
  const clearComposedPrompt = useCallback(() => {
    setComposedPrompt(null);
  }, []);

  return (
    <div className="image-generator">
      {/* Compose Button (optional) */}
      {showComposeButton && (
        <div className="image-generator__toolbar">
          {composedPrompt ? (
            <div className="image-generator__composed-indicator">
              <button
                className="image-generator__compose-btn image-generator__compose-btn--active"
                onClick={() => setComposerOpen(true)}
                type="button"
                title="Edit composed prompt"
              >
                <span className="image-generator__compose-icon">&#9998;</span>
                Composed
              </button>
              <button
                className="image-generator__clear-composed-btn"
                onClick={clearComposedPrompt}
                type="button"
                title="Clear composed prompt and use default"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              className="image-generator__compose-btn"
              onClick={() => setComposerOpen(true)}
              type="button"
            >
              Compose Prompt
            </button>
          )}
        </div>
      )}

      {/* Prompt Composer Dialog */}
      <PromptComposerDialog
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onGenerate={handleComposedPrompt}
        appearance={appearance}
        characterConfig={characterConfig}
        projectPath={projectPath}
      />

      {/* Image Display Area */}
      <div
        className={`image-generator__display ${isClickable ? 'clickable' : ''}`}
        onClick={isClickable ? handleDisplayClick : undefined}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Generated preview"
            className="image-generator__image"
          />
        ) : (
          <div className="image-generator__placeholder">
            {isGenerating ? (
              <>
                <div className="image-generator__spinner" />
                <span>{state === 'generating_preview' ? 'Generating...' : 'Rendering...'}</span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
        )}

        {/* Overlay controls */}
        <div className="image-generator__overlay">
          {/* Top row: seed tag (left) and clear button (right) */}
          {hasPreview && !isGenerating && (
            <div className="image-generator__overlay-top">
              {/* Seed tag with refresh */}
              {currentSeed !== null && state !== 'complete' && (
                <button
                  className="image-generator__seed-tag"
                  onClick={(e) => {
                    e.stopPropagation();
                    generatePreview();
                  }}
                  title="Generate with new seed"
                >
                  <span className="image-generator__refresh-icon">&#x21bb;</span>
                  <span className="image-generator__seed-value">{currentSeed}</span>
                </button>
              )}

              {/* Status badge for complete state */}
              {state === 'complete' && (
                <div className={`image-generator__badge ${savedImagePath ? 'image-generator__badge--complete' : 'image-generator__badge--rendered'}`}>
                  {savedImagePath ? 'Saved' : 'Rendered'}
                </div>
              )}

              {/* Clear button */}
              {(state === 'preview_ready' || state === 'complete') && (
                <button
                  className="image-generator__clear-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  title="Clear"
                >
                  &#x2715;
                </button>
              )}
            </div>
          )}

          {/* Rendering overlay (shown when rendering with existing preview) */}
          {state === 'generating_render' && imageSrc && (
            <div className="image-generator__rendering-overlay">
              <div className="image-generator__spinner" />
              <span>Rendering...</span>
            </div>
          )}

          {/* Center action hint */}
          {isClickable && !isGenerating && (
            <div className="image-generator__action-hint">
              {state === 'idle' && <span>Click to Generate</span>}
              {state === 'preview_ready' && <span>{canSaveToDisk ? 'Click to Save' : 'Click to Render'}</span>}
              {state === 'complete' && <span>Click to Generate New</span>}
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="image-generator__error">{error}</div>
      )}
    </div>
  );
}

export default ImageGenerator;
