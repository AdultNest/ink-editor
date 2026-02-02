/**
 * CharacterConfigEditor component
 *
 * Editor for character AI configuration files (.conf).
 * Provides a guided interface for creating:
 * - Image prompt sets (for ComfyUI generation)
 * - Mood sets (for Ollama text generation)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  type CharacterAppearance,
  type CharacterConfig,
  promptBuilder,
} from '../../services/promptBuilder';
import { ImageGenerator } from '../ImageGenerator';
import { QuickPromptBuilder } from '../QuickPromptBuilder';
import './CharacterConfigEditor.css';

export interface CharacterConfigEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface ImagePromptSet {
  name: string;
  positive: string;
  negative?: string;
}

interface MoodSet {
  name: string;
  description: string;
}

/** Extended config for the editor (adds required arrays) */
interface EditorCharacterConfig extends CharacterConfig {
  imagePromptSets: ImagePromptSet[];
  moodSets: MoodSet[];
}

const DEFAULT_APPEARANCE: CharacterAppearance = {
  // Core attributes
  gender: '',
  ageGroup: '',
  hairStyle: '',
  hairColor: '',
  eyeColor: '',
  bodyType: '',
  skinTone: '',
  artStyle: 'realistic',
  // Face details
  faceShape: '',
  noseType: '',
  lipType: '',
  eyebrowStyle: '',
  eyeShape: '',
  cheekbones: '',
  jawline: '',
  foreheadSize: '',
  chinType: '',
  // Upper body details
  shoulderWidth: '',
  armType: '',
  neckLength: '',
  // Lower body details
  hipWidth: '',
  legType: '',
  buttSize: '',
  // Accessories & details
  glasses: '',
  earrings: '',
  freckles: '',
  // Gender-specific
  facialHair: '',
  breastSize: '',
  // Tags
  qualityTags: promptBuilder.getQualityTagOptions(),
  additionalTags: '',
  negativeTags: promptBuilder.getNegativeTagOptions(),
  additionalNegativeTags: '',
};

const DEFAULT_CONFIG: EditorCharacterConfig = {
  characterId: '',
  appearance: { ...DEFAULT_APPEARANCE },
  imagePromptSets: [],
  moodSets: [],
};

// Common prompt suggestions for guidance (for custom prompt sets)
const PROMPT_SUGGESTIONS = {
  appearance: ['1girl', '1boy', '1guy', 'young woman', 'young man', 'mature woman', 'mature man'],
  hair: ['blonde hair', 'brown hair', 'black hair', 'red hair', 'silver hair', 'short hair', 'long hair', 'ponytail', 'twin tails'],
  eyes: ['blue eyes', 'green eyes', 'brown eyes', 'red eyes', 'heterochromia'],
  clothing: ['casual clothes', 'formal suit', 'dress', 't-shirt', 'hoodie', 'school uniform', 'business attire'],
  style: ['realistic', 'anime style', 'semi-realistic', 'photorealistic', 'digital art'],
  quality: ['masterpiece', 'best quality', 'high resolution', 'detailed', '8k'],
};

const NEGATIVE_SUGGESTIONS = [
  'bad quality', 'worst quality', 'low quality', 'blurry', 'pixelated',
  'deformed', 'ugly', 'bad anatomy', 'bad hands', 'extra fingers',
  'missing fingers', 'extra limbs', 'missing limbs', 'watermark', 'text',
];

const MOOD_SUGGESTIONS = [
  { name: 'friendly', desc: 'Warm, approachable, uses casual language and humor' },
  { name: 'flirty', desc: 'Playful, charming, uses subtle compliments and teasing' },
  { name: 'serious', desc: 'Direct, focused, professional tone' },
  { name: 'shy', desc: 'Reserved, hesitant, uses shorter sentences' },
  { name: 'confident', desc: 'Self-assured, bold, takes initiative in conversation' },
  { name: 'mysterious', desc: 'Enigmatic, speaks in riddles, reveals little' },
  { name: 'angry', desc: 'Frustrated, uses sharp words, confrontational' },
  { name: 'sad', desc: 'Melancholic, speaks softly, needs comfort' },
];

export function CharacterConfigEditor({ filePath, fileName, onDirtyChange }: CharacterConfigEditorProps) {
  const [config, setConfig] = useState<EditorCharacterConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<EditorCharacterConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'appearance' | 'image' | 'mood'>('appearance');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingMoodIndex, setEditingMoodIndex] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<'positive' | 'negative' | null>(null);
  // Collapsible sections
  const [faceDetailsExpanded, setFaceDetailsExpanded] = useState(false);
  const [upperBodyExpanded, setUpperBodyExpanded] = useState(false);
  const [lowerBodyExpanded, setLowerBodyExpanded] = useState(false);
  // Library component additions for preview
  const [libraryPositive, setLibraryPositive] = useState('');
  const [libraryNegative, setLibraryNegative] = useState('');

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig);

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

  // Get project path from file path (parent directory)
  const projectPath = filePath.substring(0, filePath.lastIndexOf('\\') || filePath.lastIndexOf('/'));
  const projectRoot = projectPath.substring(0, projectPath.lastIndexOf('\\') || projectPath.lastIndexOf('/'));

  // Build full body prompt for the image generator (for character review)
  const previewPrompt = useMemo(() => {
    if (!config.appearance) return { positive: '', negative: '' };
    const basePrompt = promptBuilder.buildFullBodyPrompt(config.appearance);
    // Include library component additions if any
    const positive = [basePrompt.positive, libraryPositive].filter(Boolean).join(', ');
    const negative = [basePrompt.negative, libraryNegative].filter(Boolean).join(', ');
    return { positive, negative };
  }, [config.appearance, libraryPositive, libraryNegative]);

  // Handle library component changes
  const handleLibraryComponentsChange = useCallback((positive: string, negative: string) => {
    setLibraryPositive(positive);
    setLibraryNegative(negative);
  }, []);

  // Copy prompt to clipboard
  const copyPrompt = useCallback(async (type: 'positive' | 'negative') => {
    if (!config.appearance) return;
    const preview = promptBuilder.buildPreview(config.appearance);
    const text = type === 'positive' ? preview.positive : preview.negative;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(type);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [config.appearance]);

  // Extract character ID from filename (e.g., "sarah.conf" -> "sarah")
  const characterIdFromFile = fileName.replace(/\.conf$/, '');

  // Load file
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(content) as EditorCharacterConfig;

        if (isMounted) {
          const loadedConfig = {
            ...DEFAULT_CONFIG,
            ...parsed,
            characterId: parsed.characterId || characterIdFromFile,
            appearance: { ...DEFAULT_APPEARANCE, ...(parsed.appearance || {}) },
            imagePromptSets: parsed.imagePromptSets || [],
            moodSets: parsed.moodSets || [],
          };
          setConfig(loadedConfig);
          setOriginalConfig(loadedConfig);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          // File might not exist or be empty, start with defaults
          const defaultConfig = {
            ...DEFAULT_CONFIG,
            characterId: characterIdFromFile,
            appearance: { ...DEFAULT_APPEARANCE },
          };
          setConfig(defaultConfig);
          setOriginalConfig(defaultConfig);
          setIsLoading(false);
        }
      }
    }

    loadFile();
    return () => { isMounted = false; };
  }, [filePath, characterIdFromFile]);

  // Save file
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const content = JSON.stringify(config, null, 2);
      await window.electronAPI.writeFile(filePath, content);
      setOriginalConfig(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, config]);

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

  // Appearance update handler
  const updateAppearance = useCallback(<K extends keyof CharacterAppearance>(
    field: K,
    value: CharacterAppearance[K]
  ) => {
    setConfig(prev => ({
      ...prev,
      appearance: {
        ...(prev.appearance || DEFAULT_APPEARANCE),
        [field]: value,
      },
    }));
  }, []);

  // Toggle quality tag
  const toggleQualityTag = useCallback((tag: string) => {
    setConfig(prev => {
      const currentTags = prev.appearance?.qualityTags || [];
      const newTags = currentTags.includes(tag)
        ? currentTags.filter(t => t !== tag)
        : [...currentTags, tag];
      return {
        ...prev,
        appearance: {
          ...(prev.appearance || DEFAULT_APPEARANCE),
          qualityTags: newTags,
        },
      };
    });
  }, []);

  // Toggle negative tag
  const toggleNegativeTag = useCallback((tag: string) => {
    setConfig(prev => {
      const currentTags = prev.appearance?.negativeTags || [];
      const newTags = currentTags.includes(tag)
        ? currentTags.filter(t => t !== tag)
        : [...currentTags, tag];
      return {
        ...prev,
        appearance: {
          ...(prev.appearance || DEFAULT_APPEARANCE),
          negativeTags: newTags,
        },
      };
    });
  }, []);

  // Image prompt set handlers
  const addImagePromptSet = useCallback(() => {
    const newSet: ImagePromptSet = {
      name: `style_${config.imagePromptSets.length + 1}`,
      positive: '',
      negative: '',
    };
    setConfig(prev => ({
      ...prev,
      imagePromptSets: [...prev.imagePromptSets, newSet],
    }));
    setEditingPromptIndex(config.imagePromptSets.length);
  }, [config.imagePromptSets.length]);

  const updateImagePromptSet = useCallback((index: number, updates: Partial<ImagePromptSet>) => {
    setConfig(prev => ({
      ...prev,
      imagePromptSets: prev.imagePromptSets.map((set, i) =>
        i === index ? { ...set, ...updates } : set
      ),
    }));
  }, []);

  const deleteImagePromptSet = useCallback((index: number) => {
    setConfig(prev => ({
      ...prev,
      imagePromptSets: prev.imagePromptSets.filter((_, i) => i !== index),
      defaultImagePromptSet: prev.defaultImagePromptSet === prev.imagePromptSets[index]?.name
        ? undefined
        : prev.defaultImagePromptSet,
    }));
    setEditingPromptIndex(null);
  }, []);

  // Mood set handlers
  const addMoodSet = useCallback(() => {
    const newSet: MoodSet = {
      name: `mood_${config.moodSets.length + 1}`,
      description: '',
    };
    setConfig(prev => ({
      ...prev,
      moodSets: [...prev.moodSets, newSet],
    }));
    setEditingMoodIndex(config.moodSets.length);
  }, [config.moodSets.length]);

  const updateMoodSet = useCallback((index: number, updates: Partial<MoodSet>) => {
    setConfig(prev => ({
      ...prev,
      moodSets: prev.moodSets.map((set, i) =>
        i === index ? { ...set, ...updates } : set
      ),
    }));
  }, []);

  const deleteMoodSet = useCallback((index: number) => {
    setConfig(prev => ({
      ...prev,
      moodSets: prev.moodSets.filter((_, i) => i !== index),
      defaultMoodSet: prev.defaultMoodSet === prev.moodSets[index]?.name
        ? undefined
        : prev.defaultMoodSet,
    }));
    setEditingMoodIndex(null);
  }, []);

  const addSuggestionToPrompt = useCallback((index: number, suggestion: string, field: 'positive' | 'negative') => {
    const currentSet = config.imagePromptSets[index];
    const currentValue = field === 'positive' ? currentSet.positive : (currentSet.negative || '');
    const newValue = currentValue ? `${currentValue}, ${suggestion}` : suggestion;
    updateImagePromptSet(index, { [field]: newValue });
  }, [config.imagePromptSets, updateImagePromptSet]);

  const applyMoodTemplate = useCallback((index: number, template: { name: string; desc: string }) => {
    updateMoodSet(index, {
      name: template.name,
      description: template.desc,
    });
  }, [updateMoodSet]);

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  return (
    <div className="content-view character-config-editor">
      {/* Header */}
      <div className="config-editor__header">
        <div className="config-editor__title">
          <span className="config-editor__icon">🤖</span>
          <div className="config-editor__title-text">
            <h2>AI Configuration: {config.characterId}</h2>
            <span className="config-editor__subtitle">Configure AI generation settings for this character</span>
          </div>
        </div>
        <div className="config-editor__actions">
          {isDirty && <span className="config-editor__dirty">Modified</span>}
          <button
            className="config-editor__save-btn"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="config-editor__error">{error}</div>
      )}

      {/* Tabs */}
      <div className="config-editor__tabs">
        <button
          className={`config-editor__tab ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          <span className="config-editor__tab-icon">👤</span>
          Appearance
        </button>
        <button
          className={`config-editor__tab ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => setActiveTab('image')}
        >
          <span className="config-editor__tab-icon">🖼️</span>
          Prompt Sets
          <span className="config-editor__tab-count">{config.imagePromptSets.length}</span>
        </button>
        <button
          className={`config-editor__tab ${activeTab === 'mood' ? 'active' : ''}`}
          onClick={() => setActiveTab('mood')}
        >
          <span className="config-editor__tab-icon">💬</span>
          Mood Sets
          <span className="config-editor__tab-count">{config.moodSets.length}</span>
        </button>
      </div>

      {/* Content */}
      <div className="config-editor__content">
        {activeTab === 'appearance' && (
          <div className="config-editor__section">
            <div className="config-editor__section-header">
              <div className="config-editor__section-info">
                <h3>Base Appearance</h3>
                <p>Define the character's physical attributes. These are used as the foundation for all image generation.</p>
              </div>
            </div>

            <div className="config-editor__appearance-grid">
              {/* Gender */}
              <div className="config-editor__field">
                <label>Gender</label>
                <select
                  value={config.appearance?.gender || ''}
                  onChange={(e) => updateAppearance('gender', e.target.value as CharacterAppearance['gender'])}
                >
                  {promptBuilder.getAttributeOptions('gender').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Age Group */}
              <div className="config-editor__field">
                <label>Age Group</label>
                <select
                  value={config.appearance?.ageGroup || ''}
                  onChange={(e) => updateAppearance('ageGroup', e.target.value as CharacterAppearance['ageGroup'])}
                >
                  {promptBuilder.getAttributeOptions('ageGroup').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Hair Style */}
              <div className="config-editor__field">
                <label>Hair Style</label>
                <select
                  value={config.appearance?.hairStyle || ''}
                  onChange={(e) => updateAppearance('hairStyle', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('hairStyle').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Hair Color */}
              <div className="config-editor__field">
                <label>Hair Color</label>
                <select
                  value={config.appearance?.hairColor || ''}
                  onChange={(e) => updateAppearance('hairColor', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('hairColor').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Eye Color */}
              <div className="config-editor__field">
                <label>Eye Color</label>
                <select
                  value={config.appearance?.eyeColor || ''}
                  onChange={(e) => updateAppearance('eyeColor', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('eyeColor').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Body Type */}
              <div className="config-editor__field">
                <label>Body Type</label>
                <select
                  value={config.appearance?.bodyType || ''}
                  onChange={(e) => updateAppearance('bodyType', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('bodyType').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Skin Tone */}
              <div className="config-editor__field">
                <label>Skin Tone</label>
                <select
                  value={config.appearance?.skinTone || ''}
                  onChange={(e) => updateAppearance('skinTone', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('skinTone').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Art Style */}
              <div className="config-editor__field">
                <label>Art Style</label>
                <select
                  value={config.appearance?.artStyle || 'realistic'}
                  onChange={(e) => updateAppearance('artStyle', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('artStyle').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Face Details Section (Collapsible) */}
            <div className="config-editor__collapsible-section">
              <button
                className={`config-editor__collapsible-header ${faceDetailsExpanded ? 'expanded' : ''}`}
                onClick={() => setFaceDetailsExpanded(!faceDetailsExpanded)}
                type="button"
              >
                <span className="config-editor__collapsible-icon">{faceDetailsExpanded ? '▼' : '▶'}</span>
                <span>Face Details</span>
                <span className="config-editor__collapsible-hint">Optional fine-tuning for facial features</span>
              </button>
              {faceDetailsExpanded && (
                <div className="config-editor__collapsible-content">
                  <div className="config-editor__appearance-grid">
                    {/* Face Shape */}
                    <div className="config-editor__field">
                      <label>Face Shape</label>
                      <select
                        value={config.appearance?.faceShape || ''}
                        onChange={(e) => updateAppearance('faceShape', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('faceShape').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Eye Shape */}
                    <div className="config-editor__field">
                      <label>Eye Shape</label>
                      <select
                        value={config.appearance?.eyeShape || ''}
                        onChange={(e) => updateAppearance('eyeShape', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('eyeShape').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Eyebrow Style */}
                    <div className="config-editor__field">
                      <label>Eyebrow Style</label>
                      <select
                        value={config.appearance?.eyebrowStyle || ''}
                        onChange={(e) => updateAppearance('eyebrowStyle', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('eyebrowStyle').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Nose Type */}
                    <div className="config-editor__field">
                      <label>Nose Type</label>
                      <select
                        value={config.appearance?.noseType || ''}
                        onChange={(e) => updateAppearance('noseType', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('noseType').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Lip Type */}
                    <div className="config-editor__field">
                      <label>Lip Type</label>
                      <select
                        value={config.appearance?.lipType || ''}
                        onChange={(e) => updateAppearance('lipType', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('lipType').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Cheekbones */}
                    <div className="config-editor__field">
                      <label>Cheekbones</label>
                      <select
                        value={config.appearance?.cheekbones || ''}
                        onChange={(e) => updateAppearance('cheekbones', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('cheekbones').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Jawline */}
                    <div className="config-editor__field">
                      <label>Jawline</label>
                      <select
                        value={config.appearance?.jawline || ''}
                        onChange={(e) => updateAppearance('jawline', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('jawline').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Chin Type */}
                    <div className="config-editor__field">
                      <label>Chin Type</label>
                      <select
                        value={config.appearance?.chinType || ''}
                        onChange={(e) => updateAppearance('chinType', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('chinType').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Forehead Size */}
                    <div className="config-editor__field">
                      <label>Forehead Size</label>
                      <select
                        value={config.appearance?.foreheadSize || ''}
                        onChange={(e) => updateAppearance('foreheadSize', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('foreheadSize').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Upper Body Details Section (Collapsible) */}
            <div className="config-editor__collapsible-section">
              <button
                className={`config-editor__collapsible-header ${upperBodyExpanded ? 'expanded' : ''}`}
                onClick={() => setUpperBodyExpanded(!upperBodyExpanded)}
                type="button"
              >
                <span className="config-editor__collapsible-icon">{upperBodyExpanded ? '▼' : '▶'}</span>
                <span>Upper Body Details</span>
                <span className="config-editor__collapsible-hint">Shoulders, arms, neck</span>
              </button>
              {upperBodyExpanded && (
                <div className="config-editor__collapsible-content">
                  <div className="config-editor__appearance-grid">
                    {/* Shoulder Width */}
                    <div className="config-editor__field">
                      <label>Shoulder Width</label>
                      <select
                        value={config.appearance?.shoulderWidth || ''}
                        onChange={(e) => updateAppearance('shoulderWidth', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('shoulderWidth').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Arm Type */}
                    <div className="config-editor__field">
                      <label>Arm Type</label>
                      <select
                        value={config.appearance?.armType || ''}
                        onChange={(e) => updateAppearance('armType', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('armType').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Neck Length */}
                    <div className="config-editor__field">
                      <label>Neck Length</label>
                      <select
                        value={config.appearance?.neckLength || ''}
                        onChange={(e) => updateAppearance('neckLength', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('neckLength').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lower Body Details Section (Collapsible) */}
            <div className="config-editor__collapsible-section">
              <button
                className={`config-editor__collapsible-header ${lowerBodyExpanded ? 'expanded' : ''}`}
                onClick={() => setLowerBodyExpanded(!lowerBodyExpanded)}
                type="button"
              >
                <span className="config-editor__collapsible-icon">{lowerBodyExpanded ? '▼' : '▶'}</span>
                <span>Lower Body Details</span>
                <span className="config-editor__collapsible-hint">Hips, legs</span>
              </button>
              {lowerBodyExpanded && (
                <div className="config-editor__collapsible-content">
                  <div className="config-editor__appearance-grid">
                    {/* Hip Width */}
                    <div className="config-editor__field">
                      <label>Hip Width</label>
                      <select
                        value={config.appearance?.hipWidth || ''}
                        onChange={(e) => updateAppearance('hipWidth', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('hipWidth').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Leg Type */}
                    <div className="config-editor__field">
                      <label>Leg Type</label>
                      <select
                        value={config.appearance?.legType || ''}
                        onChange={(e) => updateAppearance('legType', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('legType').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Butt Size - Female only or optional for all */}
                    <div className="config-editor__field">
                      <label>Butt Size</label>
                      <select
                        value={config.appearance?.buttSize || ''}
                        onChange={(e) => updateAppearance('buttSize', e.target.value)}
                      >
                        {promptBuilder.getAttributeOptions('buttSize').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accessories & Details Section */}
            <div className="config-editor__section-divider">
              <span>Accessories & Details</span>
            </div>

            <div className="config-editor__appearance-grid">
              {/* Glasses */}
              <div className="config-editor__field">
                <label>Glasses</label>
                <select
                  value={config.appearance?.glasses || ''}
                  onChange={(e) => updateAppearance('glasses', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('glasses').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Earrings */}
              <div className="config-editor__field">
                <label>Earrings</label>
                <select
                  value={config.appearance?.earrings || ''}
                  onChange={(e) => updateAppearance('earrings', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('earrings').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Freckles */}
              <div className="config-editor__field">
                <label>Freckles</label>
                <select
                  value={config.appearance?.freckles || ''}
                  onChange={(e) => updateAppearance('freckles', e.target.value)}
                >
                  {promptBuilder.getAttributeOptions('freckles').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Facial Hair - Male only */}
              {config.appearance?.gender === 'male' && (
                <div className="config-editor__field">
                  <label>Facial Hair</label>
                  <select
                    value={config.appearance?.facialHair || ''}
                    onChange={(e) => updateAppearance('facialHair', e.target.value)}
                  >
                    {promptBuilder.getAttributeOptions('facialHair').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Breast Size - Female only */}
              {config.appearance?.gender === 'female' && (
                <div className="config-editor__field">
                  <label>Breast Size</label>
                  <select
                    value={config.appearance?.breastSize || ''}
                    onChange={(e) => updateAppearance('breastSize', e.target.value)}
                  >
                    {promptBuilder.getAttributeOptions('breastSize').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quality Tags */}
            <div className="config-editor__field config-editor__field--full">
              <label>Quality Tags</label>
              <div className="config-editor__tag-grid">
                {promptBuilder.getQualityTagOptions().map(tag => (
                  <button
                    key={tag}
                    className={`config-editor__tag-btn ${config.appearance?.qualityTags?.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleQualityTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Tags */}
            <div className="config-editor__field config-editor__field--full">
              <label>Additional Tags</label>
              <input
                type="text"
                value={config.appearance?.additionalTags || ''}
                onChange={(e) => updateAppearance('additionalTags', e.target.value)}
                placeholder="e.g., freckles, glasses, tattoo, specific features..."
              />
              <p className="config-editor__field-hint">
                Add any other visual details not covered above, separated by commas.
              </p>
            </div>

            {/* Negative Tags */}
            <div className="config-editor__field config-editor__field--full">
              <label>Negative Tags</label>
              <div className="config-editor__tag-grid">
                {promptBuilder.getNegativeTagOptions().map(tag => (
                  <button
                    key={tag}
                    className={`config-editor__tag-btn config-editor__tag-btn--negative ${config.appearance?.negativeTags?.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleNegativeTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Negative Tags */}
            <div className="config-editor__field config-editor__field--full">
              <label>Additional Negative Tags</label>
              <input
                type="text"
                value={config.appearance?.additionalNegativeTags || ''}
                onChange={(e) => updateAppearance('additionalNegativeTags', e.target.value)}
                placeholder="e.g., specific things to avoid..."
              />
              <p className="config-editor__field-hint">
                Add any other tags to avoid, separated by commas.
              </p>
            </div>

            {/* Preview of generated prompts */}
            <div className="config-editor__preview">
              <div className="config-editor__preview-header">
                <label>Generated Positive Prompt Preview</label>
                <button
                  className="config-editor__copy-btn"
                  onClick={() => copyPrompt('positive')}
                  title="Copy to clipboard"
                >
                  {copiedField === 'positive' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="config-editor__preview-text">
                {promptBuilder.buildPreview(config.appearance).positive}
              </div>
            </div>

            <div className="config-editor__preview config-editor__preview--negative">
              <div className="config-editor__preview-header">
                <label>Generated Negative Prompt Preview</label>
                <button
                  className="config-editor__copy-btn"
                  onClick={() => copyPrompt('negative')}
                  title="Copy to clipboard"
                >
                  {copiedField === 'negative' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="config-editor__preview-text">
                {promptBuilder.buildPreview(config.appearance).negative}
              </div>
            </div>

            {/* Quick Prompt Builder for Library Components */}
            <div className="config-editor__quick-prompt-builder">
              <QuickPromptBuilder
                projectPath={projectRoot}
                onComponentsChange={handleLibraryComponentsChange}
                initiallyExpanded={true}
              />
            </div>

            {/* Image Generator */}
            <div className="config-editor__image-generator">
              <label>Character Preview</label>
              <ImageGenerator
                positivePrompt={previewPrompt.positive}
                negativePrompt={previewPrompt.negative}
                projectPath={projectRoot}
                placeholder="Generate a preview to see how your character will look"
                saveToDisk={false}
              />
            </div>
          </div>
        )}

        {activeTab === 'image' && (
          <div className="config-editor__section">
            <div className="config-editor__section-header">
              <div className="config-editor__section-info">
                <h3>Image Prompt Sets</h3>
                <p>Define additional style presets (clothing, poses, etc.) that extend the base appearance. Each set will be combined with the base appearance when generating images.</p>
              </div>
              <button className="config-editor__add-btn" onClick={addImagePromptSet}>
                + Add Prompt Set
              </button>
            </div>

            {config.imagePromptSets.length === 0 ? (
              <div className="config-editor__empty">
                <span className="config-editor__empty-icon">🖼️</span>
                <p>No image prompt sets defined yet.</p>
                <p className="config-editor__empty-hint">
                  Create prompt sets to define your character's appearance for different situations (casual, formal, etc.)
                </p>
                <button className="config-editor__add-btn" onClick={addImagePromptSet}>
                  Create First Prompt Set
                </button>
              </div>
            ) : (
              <div className="config-editor__list">
                {config.imagePromptSets.map((promptSet, index) => (
                  <div
                    key={index}
                    className={`config-editor__item ${editingPromptIndex === index ? 'expanded' : ''}`}
                  >
                    <div
                      className="config-editor__item-header"
                      onClick={() => setEditingPromptIndex(editingPromptIndex === index ? null : index)}
                    >
                      <div className="config-editor__item-info">
                        <span className="config-editor__item-name">{promptSet.name}</span>
                        {config.defaultImagePromptSet === promptSet.name && (
                          <span className="config-editor__default-badge">Default</span>
                        )}
                      </div>
                      <div className="config-editor__item-actions">
                        <button
                          className="config-editor__set-default-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfig(prev => ({ ...prev, defaultImagePromptSet: promptSet.name }));
                          }}
                          title="Set as default"
                        >
                          ⭐
                        </button>
                        <button
                          className="config-editor__delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteImagePromptSet(index);
                          }}
                          title="Delete"
                        >
                          🗑️
                        </button>
                        <span className="config-editor__expand-icon">
                          {editingPromptIndex === index ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>

                    {editingPromptIndex === index && (
                      <div className="config-editor__item-content">
                        <div className="config-editor__field">
                          <label>Set Name</label>
                          <input
                            type="text"
                            value={promptSet.name}
                            onChange={(e) => updateImagePromptSet(index, { name: e.target.value })}
                            placeholder="e.g., casual, formal, swimwear"
                          />
                        </div>

                        <div className="config-editor__field">
                          <label>Positive Prompt (Character Appearance)</label>
                          <textarea
                            value={promptSet.positive}
                            onChange={(e) => updateImagePromptSet(index, { positive: e.target.value })}
                            placeholder="e.g., 1girl, brown hair, blue eyes, casual clothes, masterpiece, best quality"
                            rows={3}
                          />
                          <div className="config-editor__suggestions">
                            <span className="config-editor__suggestions-label">Quick add:</span>
                            <div className="config-editor__suggestion-groups">
                              {Object.entries(PROMPT_SUGGESTIONS).map(([category, suggestions]) => (
                                <div key={category} className="config-editor__suggestion-group">
                                  <span className="config-editor__suggestion-category">{category}:</span>
                                  {suggestions.slice(0, 4).map((suggestion) => (
                                    <button
                                      key={suggestion}
                                      className="config-editor__suggestion-btn"
                                      onClick={() => addSuggestionToPrompt(index, suggestion, 'positive')}
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="config-editor__field">
                          <label>Negative Prompt (What to Avoid)</label>
                          <textarea
                            value={promptSet.negative || ''}
                            onChange={(e) => updateImagePromptSet(index, { negative: e.target.value })}
                            placeholder="e.g., bad quality, blurry, deformed, extra limbs"
                            rows={2}
                          />
                          <div className="config-editor__suggestions">
                            <span className="config-editor__suggestions-label">Common negatives:</span>
                            <div className="config-editor__suggestion-row">
                              {NEGATIVE_SUGGESTIONS.slice(0, 8).map((suggestion) => (
                                <button
                                  key={suggestion}
                                  className="config-editor__suggestion-btn"
                                  onClick={() => addSuggestionToPrompt(index, suggestion, 'negative')}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mood' && (
          <div className="config-editor__section">
            <div className="config-editor__section-header">
              <div className="config-editor__section-info">
                <h3>Mood Sets</h3>
                <p>Define personality presets for text generation. Each mood describes how the character behaves and speaks in different emotional states.</p>
              </div>
              <button className="config-editor__add-btn" onClick={addMoodSet}>
                + Add Mood Set
              </button>
            </div>

            {config.moodSets.length === 0 ? (
              <div className="config-editor__empty">
                <span className="config-editor__empty-icon">💬</span>
                <p>No mood sets defined yet.</p>
                <p className="config-editor__empty-hint">
                  Create mood sets to define how your character speaks and behaves in different emotional states.
                </p>
                <button className="config-editor__add-btn" onClick={addMoodSet}>
                  Create First Mood Set
                </button>
              </div>
            ) : (
              <div className="config-editor__list">
                {config.moodSets.map((moodSet, index) => (
                  <div
                    key={index}
                    className={`config-editor__item ${editingMoodIndex === index ? 'expanded' : ''}`}
                  >
                    <div
                      className="config-editor__item-header"
                      onClick={() => setEditingMoodIndex(editingMoodIndex === index ? null : index)}
                    >
                      <div className="config-editor__item-info">
                        <span className="config-editor__item-name">{moodSet.name}</span>
                        {config.defaultMoodSet === moodSet.name && (
                          <span className="config-editor__default-badge">Default</span>
                        )}
                      </div>
                      <div className="config-editor__item-actions">
                        <button
                          className="config-editor__set-default-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfig(prev => ({ ...prev, defaultMoodSet: moodSet.name }));
                          }}
                          title="Set as default"
                        >
                          ⭐
                        </button>
                        <button
                          className="config-editor__delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMoodSet(index);
                          }}
                          title="Delete"
                        >
                          🗑️
                        </button>
                        <span className="config-editor__expand-icon">
                          {editingMoodIndex === index ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>

                    {editingMoodIndex === index && (
                      <div className="config-editor__item-content">
                        <div className="config-editor__field">
                          <label>Mood Name</label>
                          <input
                            type="text"
                            value={moodSet.name}
                            onChange={(e) => updateMoodSet(index, { name: e.target.value })}
                            placeholder="e.g., friendly, flirty, serious"
                          />
                        </div>

                        <div className="config-editor__field">
                          <label>Personality Description</label>
                          <textarea
                            value={moodSet.description}
                            onChange={(e) => updateMoodSet(index, { description: e.target.value })}
                            placeholder="Describe how the character behaves, speaks, and interacts when in this mood..."
                            rows={4}
                          />
                          <p className="config-editor__field-hint">
                            Describe the character's tone, word choices, body language, and typical responses.
                          </p>
                        </div>

                        <div className="config-editor__templates">
                          <span className="config-editor__templates-label">Start from template:</span>
                          <div className="config-editor__template-grid">
                            {MOOD_SUGGESTIONS.map((template) => (
                              <button
                                key={template.name}
                                className="config-editor__template-btn"
                                onClick={() => applyMoodTemplate(index, template)}
                              >
                                <span className="config-editor__template-name">{template.name}</span>
                                <span className="config-editor__template-desc">{template.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CharacterConfigEditor;
