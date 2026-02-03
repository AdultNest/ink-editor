/**
 * PromptComposerDialog component
 *
 * Modal dialog for composing complex image prompts from reusable components.
 * Supports shot type selection for regional prompt filtering.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type ProjectPromptLibrary,
  type CharacterAppearance,
  type GeneratedPrompt,
  PromptComponentCategory,
  PromptRegion,
  CATEGORY_INFO,
  promptLibraryService,
  promptBuilder,
  getDefaultLibrary,
} from '../../services';
import type { CharacterAIConfig } from '../../ink/ai/characterConfig';
import { ComponentPicker } from './ComponentPicker';
import './PromptComposerDialog.css';

export interface PromptComposerDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Callback when user confirms with composed prompt */
  onGenerate: (prompt: GeneratedPrompt) => void;
  /** Character appearance (optional, for regional prompting) */
  appearance?: CharacterAppearance;
  /** Full character AI config (optional, for prompt sets and mood sets) */
  characterConfig?: CharacterAIConfig | null;
  /** Project path for loading the prompt library */
  projectPath: string;
}

/** Region toggle configuration */
const REGION_OPTIONS: { value: PromptRegion; label: string; icon: string; description: string }[] = [
  { value: PromptRegion.HEAD, label: 'Head', icon: '👤', description: 'Face, hair, expressions' },
  { value: PromptRegion.UPPER_BODY, label: 'Upper Body', icon: '👕', description: 'Shoulders, chest, arms' },
  { value: PromptRegion.LOWER_BODY, label: 'Lower Body', icon: '👖', description: 'Hips, legs' },
  { value: PromptRegion.FULL_BODY, label: 'General', icon: '🧍', description: 'Body type, height, skin tone' },
];

export function PromptComposerDialog({
  isOpen,
  onClose,
  onGenerate,
  appearance,
  characterConfig,
  projectPath,
}: PromptComposerDialogProps) {
  const [library, setLibrary] = useState<ProjectPromptLibrary>(getDefaultLibrary());
  const [isLoading, setIsLoading] = useState(true);
  // Track which regions are enabled (all enabled by default)
  const [enabledRegions, setEnabledRegions] = useState<Set<PromptRegion>>(
    new Set([PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY])
  );
  // Track if character is included at all
  const [includeCharacter, setIncludeCharacter] = useState(true);
  const [selectedComponents, setSelectedComponents] = useState<Record<PromptComponentCategory, string | null>>({
    [PromptComponentCategory.LOCATION]: null,
    [PromptComponentCategory.CLOTHING]: null,
    [PromptComponentCategory.ACTION]: null,
    [PromptComponentCategory.TIME_WEATHER]: null,
    [PromptComponentCategory.IMAGE_STYLE]: null,
    [PromptComponentCategory.MOOD]: null,
  });
  const [customPositive, setCustomPositive] = useState('');
  const [customNegative, setCustomNegative] = useState('');
  // Character prompt set and mood set selection
  const [selectedPromptSet, setSelectedPromptSet] = useState<string>('');
  const [selectedMoodSet, setSelectedMoodSet] = useState<string>('');

  // Get available image styles and moods from library
  const imageStyles = useMemo(() => {
    return promptLibraryService.getComponentsByCategory(library, PromptComponentCategory.IMAGE_STYLE);
  }, [library]);

  const moodComponents = useMemo(() => {
    return promptLibraryService.getComponentsByCategory(library, PromptComponentCategory.MOOD);
  }, [library]);

  // Initialize defaults when dialog opens
  useEffect(() => {
    if (isOpen && characterConfig) {
      setSelectedPromptSet(characterConfig.defaultImageStyleId || '');
      setSelectedMoodSet(characterConfig.defaultMoodId || '');
    }
  }, [isOpen, characterConfig]);

  // Load library when dialog opens
  useEffect(() => {
    if (isOpen && projectPath) {
      setIsLoading(true);
      promptLibraryService.loadLibrary(projectPath)
        .then(lib => {
          setLibrary(lib);
          setIsLoading(false);
        })
        .catch(() => {
          setLibrary(getDefaultLibrary());
          setIsLoading(false);
        });
    }
  }, [isOpen, projectPath]);

  // Build the preview prompt
  const previewPrompt = useMemo((): GeneratedPrompt => {
    // Start with character appearance (regional filtering)
    let basePrompt: GeneratedPrompt = { positive: '', negative: '' };
    if (appearance && includeCharacter && enabledRegions.size > 0) {
      // Build prompt with only enabled regions
      basePrompt = promptBuilder.buildRegionalPromptWithRegions(appearance, Array.from(enabledRegions));
    }

    // Add selected image style from library
    let promptSetPrompt: GeneratedPrompt = { positive: '', negative: '' };
    if (selectedPromptSet && imageStyles.length > 0) {
      const styleComponent = promptLibraryService.getComponentById(library, selectedPromptSet);
      if (styleComponent) {
        promptSetPrompt = {
          positive: styleComponent.positive || '',
          negative: styleComponent.negative || '',
        };
      }
    }

    // Add selected mood visual prompts from library
    let moodHint = '';
    let moodNegative = '';
    if (selectedMoodSet && moodComponents.length > 0) {
      const moodComponent = promptLibraryService.getComponentById(library, selectedMoodSet);
      if (moodComponent) {
        // Use the mood's visual prompts for image generation
        moodHint = moodComponent.positive || '';
        moodNegative = moodComponent.negative || '';
      }
    }

    // Add selected components
    const componentIds = Object.values(selectedComponents).filter((id): id is string => id !== null);
    const componentPrompt = promptLibraryService.buildPromptFromComponents(library, componentIds);

    // Combine all parts
    const positiveParts = [
      basePrompt.positive,
      promptSetPrompt.positive,
      moodHint,
      componentPrompt.positive,
      customPositive,
    ].filter(Boolean);
    const negativeParts = [
      basePrompt.negative,
      promptSetPrompt.negative,
      moodNegative,
      componentPrompt.negative,
      customNegative,
    ].filter(Boolean);

    return {
      positive: positiveParts.join(', '),
      negative: negativeParts.join(', '),
    };
  }, [appearance, includeCharacter, enabledRegions, library, selectedComponents, customPositive, customNegative, selectedPromptSet, selectedMoodSet, imageStyles, moodComponents]);

  // Toggle a specific region
  const toggleRegion = useCallback((region: PromptRegion) => {
    setEnabledRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }
      return next;
    });
  }, []);

  // Quick presets for region selection
  const setRegionPreset = useCallback((preset: 'all' | 'portrait' | 'upper' | 'lower' | 'none') => {
    switch (preset) {
      case 'all':
        setEnabledRegions(new Set([PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY]));
        setIncludeCharacter(true);
        break;
      case 'portrait':
        setEnabledRegions(new Set([PromptRegion.HEAD, PromptRegion.FULL_BODY]));
        setIncludeCharacter(true);
        break;
      case 'upper':
        setEnabledRegions(new Set([PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.FULL_BODY]));
        setIncludeCharacter(true);
        break;
      case 'lower':
        setEnabledRegions(new Set([PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY]));
        setIncludeCharacter(true);
        break;
      case 'none':
        setIncludeCharacter(false);
        break;
    }
  }, []);

  // Handle component selection
  const handleSelectComponent = useCallback((category: PromptComponentCategory, id: string | null) => {
    setSelectedComponents(prev => ({
      ...prev,
      [category]: id,
    }));
  }, []);

  // Handle generate
  const handleGenerate = useCallback(() => {
    onGenerate(previewPrompt);
    onClose();
  }, [previewPrompt, onGenerate, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="prompt-composer-backdrop" onClick={handleBackdropClick}>
      <div className="prompt-composer-dialog">
        {/* Header */}
        <div className="prompt-composer__header">
          <h2>Compose Image Prompt</h2>
          <button className="prompt-composer__close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {isLoading ? (
          <div className="prompt-composer__loading">
            <div className="prompt-composer__spinner" />
            <span>Loading library...</span>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="prompt-composer__content">
              {/* Character Regions Selection */}
              {appearance && (
                <div className="prompt-composer__section">
                  <label className="prompt-composer__section-label">Character Regions</label>

                  {/* Include character toggle */}
                  <div className="prompt-composer__character-toggle">
                    <label className="prompt-composer__checkbox-label">
                      <input
                        type="checkbox"
                        checked={includeCharacter}
                        onChange={(e) => setIncludeCharacter(e.target.checked)}
                      />
                      <span>Include character appearance</span>
                    </label>
                  </div>

                  {includeCharacter && (
                    <>
                      {/* Quick presets */}
                      <div className="prompt-composer__region-presets">
                        <button
                          type="button"
                          className={`prompt-composer__preset-btn ${enabledRegions.size === 4 ? 'active' : ''}`}
                          onClick={() => setRegionPreset('all')}
                          title="All body regions"
                        >
                          Full Body
                        </button>
                        <button
                          type="button"
                          className={`prompt-composer__preset-btn ${enabledRegions.has(PromptRegion.HEAD) && enabledRegions.has(PromptRegion.UPPER_BODY) && !enabledRegions.has(PromptRegion.LOWER_BODY) ? 'active' : ''}`}
                          onClick={() => setRegionPreset('upper')}
                          title="Head + upper body"
                        >
                          Upper Body
                        </button>
                        <button
                          type="button"
                          className={`prompt-composer__preset-btn ${enabledRegions.has(PromptRegion.HEAD) && !enabledRegions.has(PromptRegion.UPPER_BODY) && !enabledRegions.has(PromptRegion.LOWER_BODY) ? 'active' : ''}`}
                          onClick={() => setRegionPreset('portrait')}
                          title="Face only"
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          className={`prompt-composer__preset-btn ${!enabledRegions.has(PromptRegion.HEAD) && enabledRegions.has(PromptRegion.LOWER_BODY) ? 'active' : ''}`}
                          onClick={() => setRegionPreset('lower')}
                          title="Lower body only (no face)"
                        >
                          Lower Only
                        </button>
                      </div>

                      {/* Individual region toggles */}
                      <div className="prompt-composer__region-toggles">
                        {REGION_OPTIONS.map(option => (
                          <label
                            key={option.value}
                            className={`prompt-composer__region-toggle ${enabledRegions.has(option.value) ? 'active' : ''}`}
                            title={option.description}
                          >
                            <input
                              type="checkbox"
                              checked={enabledRegions.has(option.value)}
                              onChange={() => toggleRegion(option.value)}
                            />
                            <span className="prompt-composer__region-icon">{option.icon}</span>
                            <span className="prompt-composer__region-label">{option.label}</span>
                          </label>
                        ))}
                      </div>

                      <p className="prompt-composer__hint">
                        {enabledRegions.size === 0
                          ? 'No regions selected - character will not be included'
                          : `Including: ${Array.from(enabledRegions).map(r => REGION_OPTIONS.find(o => o.value === r)?.label).join(', ')}`}
                      </p>
                    </>
                  )}

                  {!includeCharacter && (
                    <p className="prompt-composer__hint">
                      Scenery mode - no character appearance will be included
                    </p>
                  )}
                </div>
              )}

              {/* Image Styles and Moods from Library */}
              {(imageStyles.length > 0 || moodComponents.length > 0) && (
                <div className="prompt-composer__section">
                  <label className="prompt-composer__section-label">Style & Mood</label>
                  <div className="prompt-composer__character-sets">
                    {imageStyles.length > 0 && (
                      <div className="prompt-composer__set-picker">
                        <label className="prompt-composer__set-label">Image Style</label>
                        <select
                          className="prompt-composer__select"
                          value={selectedPromptSet}
                          onChange={(e) => setSelectedPromptSet(e.target.value)}
                        >
                          <option value="">None</option>
                          {imageStyles.map(style => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {moodComponents.length > 0 && (
                      <div className="prompt-composer__set-picker">
                        <label className="prompt-composer__set-label">Mood</label>
                        <select
                          className="prompt-composer__select"
                          value={selectedMoodSet}
                          onChange={(e) => setSelectedMoodSet(e.target.value)}
                        >
                          <option value="">None</option>
                          {moodComponents.map(mood => (
                            <option key={mood.id} value={mood.id} title={mood.description}>
                              {mood.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {selectedMoodSet && moodComponents.length > 0 && (
                    <p className="prompt-composer__hint">
                      {promptLibraryService.getMoodDescription(library, selectedMoodSet)}
                    </p>
                  )}
                </div>
              )}

              {/* Component Pickers */}
              <div className="prompt-composer__pickers">
                {CATEGORY_INFO.map(info => (
                  <ComponentPicker
                    key={info.category}
                    label={`${info.icon} ${info.label}`}
                    components={promptLibraryService.getComponentsByCategory(library, info.category)}
                    selectedId={selectedComponents[info.category]}
                    onSelect={(id) => handleSelectComponent(info.category, id)}
                    placeholder={`Select ${info.label.toLowerCase()}...`}
                  />
                ))}
              </div>

              {/* Custom Additions */}
              <div className="prompt-composer__section">
                <label className="prompt-composer__section-label">Custom Additions (Optional)</label>
                <textarea
                  className="prompt-composer__textarea"
                  value={customPositive}
                  onChange={(e) => setCustomPositive(e.target.value)}
                  placeholder="Additional positive tags..."
                  rows={2}
                />
              </div>

              {/* Preview */}
              <div className="prompt-composer__preview">
                <div className="prompt-composer__preview-section">
                  <label>
                    <span className="prompt-composer__preview-icon">+</span>
                    Positive Prompt
                  </label>
                  <div className="prompt-composer__preview-text prompt-composer__preview-text--positive">
                    {previewPrompt.positive || '(Empty)'}
                  </div>
                </div>
                <div className="prompt-composer__preview-section">
                  <label>
                    <span className="prompt-composer__preview-icon">-</span>
                    Negative Prompt
                  </label>
                  <div className="prompt-composer__preview-text prompt-composer__preview-text--negative">
                    {previewPrompt.negative || '(Empty)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="prompt-composer__footer">
              <button className="prompt-composer__cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button className="prompt-composer__generate-btn" onClick={handleGenerate}>
                Generate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PromptComposerDialog;
