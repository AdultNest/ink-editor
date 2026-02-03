/**
 * ContentItemEditor Component
 *
 * Polymorphic editor for different content item types.
 */

import { useCallback, useState, useEffect, useMemo } from 'react';
import type { KnotContentItem } from '../parser/inkTypes';
import { MediaValidator } from '../parser/mediaValidator';
import type { AppSettings } from '../../../preload';
import type { CharacterAIConfig } from '../ai/characterConfig';
import { buildImagePromptWithCharacter } from '../ai/characterConfig';
import {
  type ProjectPromptLibrary,
  PromptComponentCategory,
  CATEGORY_INFO,
  promptLibraryService,
  getDefaultLibrary,
  promptBuilder,
} from '../../../renderer/services';
import { ImageGenerator } from '../../../renderer/components/ImageGenerator';

import './KnotVisualEditor.css';

export interface ContentItemEditorProps {
  /** The item being edited */
  item: KnotContentItem;
  /** Callback when item properties change */
  onChange: (updates: Partial<KnotContentItem>) => void;
  /** Callback to delete the item */
  onDelete: () => void;
  /** Callback to move item up */
  onMoveUp?: () => void;
  /** Callback to move item down */
  onMoveDown?: () => void;
  /** Project path for media selection */
  projectPath: string;
  /** Available knot names for divert autocomplete */
  availableKnots: string[];
  /** Available stitch paths for divert autocomplete (format: knot.stitch) */
  availableStitches?: string[];
  /** Available flag names for autocomplete */
  availableFlags: string[];
  /** Validation error message */
  error?: string;
  /** App settings for AI features */
  appSettings?: AppSettings;
  /** Character AI configuration for generation */
  characterConfig?: CharacterAIConfig | null;
}

export function ContentItemEditor({
  item,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  projectPath,
  availableKnots,
  availableStitches = [],
  availableFlags,
  error,
  appSettings,
  characterConfig,
}: ContentItemEditorProps) {
  // Available media files
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [availableVideos, setAvailableVideos] = useState<string[]>([]);
  const [mediaReloadTrigger, setMediaReloadTrigger] = useState(0);

  // Callback to reload media after AI generation
  const reloadMedia = useCallback(() => {
    setMediaReloadTrigger(prev => prev + 1);
  }, []);

  // Load available media files
  useEffect(() => {
    const loadMedia = async () => {
      try {
        const validator = new MediaValidator(projectPath);
        const images = await validator.getAvailableImages();
        const videos = await validator.getAvailableVideos();
        setAvailableImages(images);
        setAvailableVideos(videos);
      } catch (err) {
        console.error('[ContentItemEditor] Failed to load media:', err);
      }
    };
    if (projectPath) {
      loadMedia();
    }
  }, [projectPath, mediaReloadTrigger]);

  // Render editor based on item type
  const renderEditor = () => {
    switch (item.type) {
      case 'text':
        return (
          <TextEditor
            content={item.content}
            onChange={(content) => onChange({ content })}
            error={error}
          />
        );

      case 'image':
        return (
          <ImageEditor
            filename={item.filename}
            availableImages={availableImages}
            onChange={(filename) => onChange({ filename })}
            error={error}
            projectPath={projectPath}
            appSettings={appSettings}
            characterConfig={characterConfig}
            onImageGenerated={reloadMedia}
          />
        );

      case 'player-image':
        return (
          <ImageEditor
            filename={item.filename}
            availableImages={availableImages}
            onChange={(filename) => onChange({ filename })}
            isPlayer={true}
            error={error}
            projectPath={projectPath}
            appSettings={appSettings}
            characterConfig={characterConfig}
            onImageGenerated={reloadMedia}
          />
        );

      case 'video':
        return (
          <VideoEditor
            filename={item.filename}
            availableVideos={availableVideos}
            onChange={(filename) => onChange({ filename })}
            error={error}
            projectPath={projectPath}
          />
        );

      case 'player-video':
        return (
          <VideoEditor
            filename={item.filename}
            availableVideos={availableVideos}
            onChange={(filename) => onChange({ filename })}
            isPlayer={true}
            error={error}
            projectPath={projectPath}
          />
        );

      case 'fake-type':
        return (
          <FakeTypeEditor
            duration={item.durationSeconds}
            onChange={(durationSeconds) => onChange({ durationSeconds })}
            label="Typing Duration (seconds)"
          />
        );

      case 'wait':
        return (
          <FakeTypeEditor
            duration={item.durationSeconds}
            onChange={(durationSeconds) => onChange({ durationSeconds })}
            label="Wait Duration (seconds)"
          />
        );

      case 'side-story':
        return (
          <SideStoryEditor
            storyName={item.storyName}
            onChange={(storyName) => onChange({ storyName })}
            error={error}
          />
        );

      case 'transition':
        return (
          <TransitionEditor
            title={item.title}
            subtitle={item.subtitle}
            onChangeTitle={(title) => onChange({ title })}
            onChangeSubtitle={(subtitle) => onChange({ subtitle })}
          />
        );

      case 'flag-operation':
        return (
          <FlagOperationEditor
            operation={item.operation}
            flagName={item.flagName}
            availableFlags={availableFlags}
            onChangeOperation={(operation) => onChange({ operation })}
            onChangeFlagName={(flagName) => onChange({ flagName })}
            error={error}
          />
        );

      case 'choice':
        return (
          <ChoiceEditor
            text={item.text}
            isSticky={item.isSticky}
            divert={item.divert}
            availableKnots={availableKnots}
            availableStitches={availableStitches}
            onChangeText={(text) => onChange({ text })}
            onChangeSticky={(isSticky) => onChange({ isSticky })}
            onChangeDivert={(divert) => onChange({ divert })}
            error={error}
          />
        );

      case 'divert':
        return (
          <DivertEditor
            target={item.target}
            availableKnots={availableKnots}
            onChange={(target) => onChange({ target })}
            error={error}
          />
        );

      case 'raw':
        return (
          <RawEditor
            content={item.content}
            onChange={(content) => onChange({ content })}
          />
        );

      case 'stitch':
        return (
          <StitchEditor
            name={item.name}
            onChange={(name) => onChange({ name })}
            error={error}
          />
        );

      default:
        return <div>Unknown item type</div>;
    }
  };

  return (
    <div className="content-item-editor">
      {renderEditor()}

      {/* Actions */}
      <div className="content-item-editor__actions">
        <div className="content-item-editor__move-btns">
          <button
            className="content-item-editor__move-btn"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            title="Move up"
          >
            ↑
          </button>
          <button
            className="content-item-editor__move-btn"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          className="content-item-editor__delete-btn"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Individual Editors
// ============================================================================

function TextEditor({
  content,
  onChange,
  error,
}: {
  content: string;
  onChange: (content: string) => void;
  error?: string;
}) {
  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">Message Text</label>
      <textarea
        className={`content-item-editor__input content-item-editor__textarea ${error ? 'content-item-editor__input--error' : ''}`}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter message text..."
      />
      {error && <div className="content-item-editor__error">{error}</div>}
    </div>
  );
}

function ImageEditor({
  filename,
  availableImages,
  onChange,
  isPlayer = false,
  error,
  projectPath,
  appSettings,
  characterConfig,
  onImageGenerated,
}: {
  filename: string;
  availableImages: string[];
  onChange: (filename: string) => void;
  isPlayer?: boolean;
  error?: string;
  projectPath: string;
  appSettings?: AppSettings;
  characterConfig?: CharacterAIConfig | null;
  onImageGenerated?: () => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiNegativePrompt, setAiNegativePrompt] = useState('');
  const [selectedPromptSet, setSelectedPromptSet] = useState<string>('');
  const [selectedMoodSet, setSelectedMoodSet] = useState<string>('');
  const [generatedFilename, setGeneratedFilename] = useState<string>('');

  // Prompt library state
  const [promptLibrary, setPromptLibrary] = useState<ProjectPromptLibrary>(getDefaultLibrary());
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<PromptComponentCategory | null>(null);

  // Load prompt library when AI panel is shown
  useEffect(() => {
    if (showAIPanel && projectPath) {
      promptLibraryService.loadLibrary(projectPath)
        .then(lib => setPromptLibrary(lib))
        .catch(() => setPromptLibrary(getDefaultLibrary()));
    }
  }, [showAIPanel, projectPath]);

  // Build prompt from selected library components
  const libraryPrompt = useMemo(() => {
    return promptLibraryService.buildPromptFromComponents(promptLibrary, Array.from(selectedLibraryIds));
  }, [promptLibrary, selectedLibraryIds]);

  // Toggle library component selection
  const toggleLibraryComponent = useCallback((id: string) => {
    setSelectedLibraryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const filteredImages = availableImages.filter((img) =>
    img.toLowerCase().includes(filterText.toLowerCase())
  );

  // Check if ComfyUI is configured
  const isComfyUIEnabled = appSettings?.comfyui?.enabled &&
    appSettings?.comfyui?.baseUrl &&
    appSettings?.comfyui?.checkpointModel;

  // Get image styles and moods from library
  const availableImageStyles = useMemo(() => {
    return promptLibraryService.getComponentsByCategory(promptLibrary, PromptComponentCategory.IMAGE_STYLE);
  }, [promptLibrary]);

  const availableMoods = useMemo(() => {
    return promptLibraryService.getComponentsByCategory(promptLibrary, PromptComponentCategory.MOOD);
  }, [promptLibrary]);

  const hasImageStyles = availableImageStyles.length > 0;
  const hasMoods = availableMoods.length > 0;

  // Get image URL for thumbnail
  const getImageUrl = (img: string) => {
    return window.electronAPI.getLocalFileUrl(`${projectPath}/Images/${img}`);
  };

  // Strip extension from filename
  const stripExtension = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    return lastDot > 0 ? name.substring(0, lastDot) : name;
  };

  // Check if a gallery item matches the current filename (compare without extension)
  const isSelected = (img: string) => {
    const imgBase = stripExtension(img);
    return imgBase === filename || img === filename;
  };

  // Generate a unique filename for AI-generated images
  const getDestFilename = useCallback(() => {
    if (!generatedFilename) {
      const timestamp = Date.now();
      const newName = `ai_generated_${timestamp}`;
      setGeneratedFilename(newName);
      return newName;
    }
    return generatedFilename;
  }, [generatedFilename]);

  // Build combined prompts for ImageGenerator
  const combinedPrompts = useMemo(() => {
    // Build prompt with character's appearance if available
    let appearancePrompt = { positive: '', negative: '' };
    if (characterConfig?.appearance) {
      appearancePrompt = promptBuilder.buildFullBodyPrompt(characterConfig.appearance);
    }

    // Build prompt with image style from library
    const { positive: stylePositive, negative: styleNegative } = buildImagePromptWithCharacter(
      aiPrompt,
      characterConfig || null,
      promptLibrary,
      selectedPromptSet || undefined
    );

    // Get mood visual prompts from library if selected
    let moodPositive = '';
    let moodNegative = '';
    if (selectedMoodSet) {
      const moodComponent = promptLibraryService.getComponentById(promptLibrary, selectedMoodSet);
      if (moodComponent) {
        moodPositive = moodComponent.positive || '';
        moodNegative = moodComponent.negative || '';
      }
    }

    // Combine: appearance + style + mood visuals + library components
    const positiveParts = [
      appearancePrompt.positive,
      stylePositive,
      moodPositive,
      libraryPrompt.positive,
    ].filter(Boolean);
    const positive = positiveParts.join(', ');

    // Combine negatives: appearance + style + mood + library + user
    const negativeParts = [
      appearancePrompt.negative,
      styleNegative,
      moodNegative,
      libraryPrompt.negative,
      aiNegativePrompt,
    ].filter(Boolean);
    const negative = negativeParts.join(', ');

    return { positive, negative };
  }, [characterConfig, aiPrompt, selectedPromptSet, selectedMoodSet, promptLibrary, libraryPrompt, aiNegativePrompt]);

  // Handle when image is saved by ImageGenerator
  const handleImageSaved = useCallback((savedPath: string) => {
    // Extract filename from path (without extension)
    const pathParts = savedPath.replace(/\\/g, '/').split('/');
    const savedFilename = pathParts[pathParts.length - 1];
    const filenameWithoutExt = stripExtension(savedFilename);

    // Update the selected filename
    onChange(filenameWithoutExt);

    // Reload available images
    if (onImageGenerated) {
      onImageGenerated();
    }

    // Reset for next generation
    setGeneratedFilename('');
  }, [onChange, onImageGenerated]);

  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">
        {isPlayer ? 'Player Image' : 'NPC Image'} Filename
      </label>
      <input
        className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
        type="text"
        value={filename}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type filename (without extension)..."
      />
      {error && <div className="content-item-editor__error">{error}</div>}

      {/* AI Generation Panel */}
      <div className="content-item-editor__ai-section">
        <button
          type="button"
          className="content-item-editor__ai-toggle"
          onClick={() => setShowAIPanel(!showAIPanel)}
        >
          {showAIPanel ? '▼ AI Generate' : '▶ AI Generate'}
          {characterConfig && (
            <span className="content-item-editor__ai-character-badge">
              {characterConfig.characterId}
            </span>
          )}
        </button>

        {showAIPanel && (
          <div className="content-item-editor__ai-panel">
            {!isComfyUIEnabled ? (
              <div className="content-item-editor__ai-disabled">
                ComfyUI not configured. Go to Settings to enable image generation.
              </div>
            ) : (
              <>
                {/* Image Style and Mood selectors from library */}
                {(hasImageStyles || hasMoods) && (
                  <div className="content-item-editor__ai-row">
                    {/* Image style selector */}
                    {hasImageStyles && (
                      <div className="content-item-editor__ai-field">
                        <label className="content-item-editor__ai-label">Style</label>
                        <select
                          className="content-item-editor__select"
                          value={selectedPromptSet}
                          onChange={(e) => setSelectedPromptSet(e.target.value)}
                        >
                          <option value="">Default</option>
                          {availableImageStyles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Mood selector */}
                    {hasMoods && (
                      <div className="content-item-editor__ai-field">
                        <label className="content-item-editor__ai-label">Mood</label>
                        <select
                          className="content-item-editor__select"
                          value={selectedMoodSet}
                          onChange={(e) => setSelectedMoodSet(e.target.value)}
                          title={selectedMoodSet ? promptLibraryService.getMoodDescription(promptLibrary, selectedMoodSet) || '' : ''}
                        >
                          <option value="">None</option>
                          {availableMoods.map((mood) => (
                            <option key={mood.id} value={mood.id} title={mood.description}>
                              {mood.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt Library Quick Picker */}
                <div className="content-item-editor__library-picker">
                  <div className="content-item-editor__library-categories">
                    {CATEGORY_INFO.map(info => {
                      const components = promptLibraryService.getComponentsByCategory(promptLibrary, info.category);
                      const selectedCount = components.filter(c => selectedLibraryIds.has(c.id)).length;
                      return (
                        <button
                          key={info.category}
                          type="button"
                          className={`content-item-editor__library-cat-btn ${activeLibraryCategory === info.category ? 'active' : ''}`}
                          onClick={() => setActiveLibraryCategory(activeLibraryCategory === info.category ? null : info.category)}
                          title={info.description}
                        >
                          {info.icon} {info.label}
                          {selectedCount > 0 && <span className="content-item-editor__library-cat-count">{selectedCount}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {activeLibraryCategory && (
                    <div className="content-item-editor__library-chips">
                      {promptLibraryService.getComponentsByCategory(promptLibrary, activeLibraryCategory).map(comp => (
                        <button
                          key={comp.id}
                          type="button"
                          className={`content-item-editor__library-chip ${selectedLibraryIds.has(comp.id) ? 'selected' : ''}`}
                          onClick={() => toggleLibraryComponent(comp.id)}
                          title={`${comp.positive}${comp.negative ? ` | Negative: ${comp.negative}` : ''}`}
                        >
                          {comp.name}
                          {selectedLibraryIds.has(comp.id) && ' ✓'}
                        </button>
                      ))}
                      {promptLibraryService.getComponentsByCategory(promptLibrary, activeLibraryCategory).length === 0 && (
                        <span className="content-item-editor__library-empty">No components</span>
                      )}
                    </div>
                  )}
                  {selectedLibraryIds.size > 0 && (
                    <div className="content-item-editor__library-selected">
                      <span className="content-item-editor__library-selected-label">Selected:</span>
                      {Array.from(selectedLibraryIds).map(id => {
                        const comp = promptLibraryService.getComponentById(promptLibrary, id);
                        return comp ? (
                          <span
                            key={id}
                            className="content-item-editor__library-chip selected"
                            onClick={() => toggleLibraryComponent(id)}
                          >
                            {comp.name} ×
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* User prompt inputs */}
                <input
                  type="text"
                  className="content-item-editor__input"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe the scene/action..."
                />
                <input
                  type="text"
                  className="content-item-editor__input"
                  value={aiNegativePrompt}
                  onChange={(e) => setAiNegativePrompt(e.target.value)}
                  placeholder="Negative prompt (optional)..."
                />

                {/* ImageGenerator component - two-stage preview/render */}
                <div className="content-item-editor__image-generator">
                  <ImageGenerator
                    positivePrompt={combinedPrompts.positive}
                    negativePrompt={combinedPrompts.negative}
                    projectPath={projectPath}
                    destFolder={`${projectPath}/Images`}
                    destFilename={getDestFilename()}
                    onImageSaved={handleImageSaved}
                    saveToDisk={true}
                    showComposeButton={true}
                    appearance={characterConfig?.appearance}
                    characterConfig={characterConfig}
                    placeholder={aiPrompt.trim() ? 'Click to preview' : 'Enter a prompt above'}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Gallery */}
      <div className="content-item-editor__gallery-section">
        <div className="content-item-editor__gallery-header">
          <span>Available Images ({availableImages.length})</span>
          {availableImages.length > 6 && (
            <input
              className="content-item-editor__gallery-filter"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter..."
            />
          )}
        </div>
        <div className="content-item-editor__gallery">
          {filteredImages.length > 0 ? (
            filteredImages.map((img) => (
              <button
                key={img}
                className={`content-item-editor__gallery-item ${isSelected(img) ? 'content-item-editor__gallery-item--selected' : ''}`}
                onClick={() => onChange(stripExtension(img))}
                type="button"
                title={img}
              >
                <img
                  src={getImageUrl(img)}
                  alt={img}
                  className="content-item-editor__gallery-thumb"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="content-item-editor__gallery-name">{stripExtension(img)}</span>
              </button>
            ))
          ) : (
            <div className="content-item-editor__gallery-empty">
              {availableImages.length === 0
                ? 'No images in /Images folder'
                : 'No matching images'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoEditor({
  filename,
  availableVideos,
  onChange,
  isPlayer = false,
  error,
  projectPath,
}: {
  filename: string;
  availableVideos: string[];
  onChange: (filename: string) => void;
  isPlayer?: boolean;
  error?: string;
  projectPath: string;
}) {
  const [filterText, setFilterText] = useState('');

  const filteredVideos = availableVideos.filter((vid) =>
    vid.toLowerCase().includes(filterText.toLowerCase())
  );

  // Strip extension from filename
  const stripExtension = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    return lastDot > 0 ? name.substring(0, lastDot) : name;
  };

  // Check if a list item matches the current filename (compare without extension)
  const isSelected = (vid: string) => {
    const vidBase = stripExtension(vid);
    return vidBase === filename || vid === filename;
  };

  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">
        {isPlayer ? 'Player Video' : 'NPC Video'} Filename
      </label>
      <input
        className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
        type="text"
        value={filename}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type filename (without extension)..."
      />
      {error && <div className="content-item-editor__error">{error}</div>}

      {/* Video list */}
      <div className="content-item-editor__gallery-section">
        <div className="content-item-editor__gallery-header">
          <span>Available Videos ({availableVideos.length})</span>
          {availableVideos.length > 6 && (
            <input
              className="content-item-editor__gallery-filter"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter..."
            />
          )}
        </div>
        <div className="content-item-editor__video-list">
          {filteredVideos.length > 0 ? (
            filteredVideos.map((vid) => (
              <button
                key={vid}
                className={`content-item-editor__video-item ${isSelected(vid) ? 'content-item-editor__video-item--selected' : ''}`}
                onClick={() => onChange(stripExtension(vid))}
                type="button"
              >
                <span className="content-item-editor__video-icon">🎬</span>
                <span className="content-item-editor__video-name">{stripExtension(vid)}</span>
              </button>
            ))
          ) : (
            <div className="content-item-editor__gallery-empty">
              {availableVideos.length === 0
                ? 'No videos in /Videos folder'
                : 'No matching videos'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FakeTypeEditor({
  duration,
  onChange,
  label = 'Duration (seconds)',
}: {
  duration: number;
  onChange: (duration: number) => void;
  label?: string;
}) {
  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">{label}</label>
      <input
        className="content-item-editor__input content-item-editor__number"
        type="number"
        min="0.5"
        max="30"
        step="0.5"
        value={duration}
        onChange={(e) => onChange(parseFloat(e.target.value) || 1)}
      />
    </div>
  );
}

function SideStoryEditor({
  storyName,
  onChange,
  error,
}: {
  storyName: string;
  onChange: (storyName: string) => void;
  error?: string;
}) {
  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">Side Story Name</label>
      <input
        className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
        type="text"
        value={storyName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="story_name"
      />
      {error && <div className="content-item-editor__error">{error}</div>}
    </div>
  );
}

function TransitionEditor({
  title,
  subtitle,
  onChangeTitle,
  onChangeSubtitle,
}: {
  title: string;
  subtitle: string;
  onChangeTitle: (title: string) => void;
  onChangeSubtitle: (subtitle: string) => void;
}) {
  return (
    <>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Title</label>
        <input
          className="content-item-editor__input"
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Chapter 1"
        />
      </div>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Subtitle</label>
        <input
          className="content-item-editor__input"
          type="text"
          value={subtitle}
          onChange={(e) => onChangeSubtitle(e.target.value)}
          placeholder="The Beginning"
        />
      </div>
    </>
  );
}

function FlagOperationEditor({
  operation,
  flagName,
  availableFlags,
  onChangeOperation,
  onChangeFlagName,
  error,
}: {
  operation: 'set' | 'remove';
  flagName: string;
  availableFlags: string[];
  onChangeOperation: (operation: 'set' | 'remove') => void;
  onChangeFlagName: (flagName: string) => void;
  error?: string;
}) {
  return (
    <>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Operation</label>
        <select
          className="content-item-editor__select"
          value={operation}
          onChange={(e) =>
            onChangeOperation(e.target.value as 'set' | 'remove')
          }
        >
          <option value="set">Set Flag</option>
          <option value="remove">Remove Flag</option>
        </select>
      </div>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Flag Name</label>
        <input
          className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
          type="text"
          value={flagName}
          onChange={(e) => onChangeFlagName(e.target.value)}
          placeholder="flag_name"
          list="available-flags"
        />
        <datalist id="available-flags">
          {availableFlags.map((flag) => (
            <option key={flag} value={flag} />
          ))}
        </datalist>
        {error && <div className="content-item-editor__error">{error}</div>}
      </div>
    </>
  );
}

function ChoiceEditor({
  text,
  isSticky,
  divert,
  availableKnots,
  availableStitches = [],
  onChangeText,
  onChangeSticky,
  onChangeDivert,
  error,
}: {
  text: string;
  isSticky: boolean;
  divert?: string;
  availableKnots: string[];
  availableStitches?: string[];
  onChangeText: (text: string) => void;
  onChangeSticky: (isSticky: boolean) => void;
  onChangeDivert: (divert?: string) => void;
  error?: string;
}) {
  return (
    <>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Choice Text</label>
        <input
          className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
          type="text"
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Enter choice text..."
        />
        {error && <div className="content-item-editor__error">{error}</div>}
      </div>
      <div className="content-item-editor__field">
        <div className="content-item-editor__checkbox-row">
          <input
            className="content-item-editor__checkbox"
            type="checkbox"
            id="sticky-choice"
            checked={isSticky}
            onChange={(e) => onChangeSticky(e.target.checked)}
          />
          <label
            className="content-item-editor__checkbox-label"
            htmlFor="sticky-choice"
          >
            Sticky choice (always available)
          </label>
        </div>
      </div>
      <div className="content-item-editor__field">
        <label className="content-item-editor__label">Divert Target</label>
        <select
          className="content-item-editor__select"
          value={divert || ''}
          onChange={(e) =>
            onChangeDivert(e.target.value || undefined)
          }
        >
          <option value="">No divert</option>
          <option value="END">END</option>
          {availableKnots.length > 0 && (
            <optgroup label="Knots">
              {availableKnots.map((knot) => (
                <option key={knot} value={knot}>
                  {knot}
                </option>
              ))}
            </optgroup>
          )}
          {availableStitches.length > 0 && (
            <optgroup label="Stitches (this knot)">
              {availableStitches.map((stitch) => (
                <option key={stitch} value={stitch}>
                  {stitch}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </>
  );
}

function DivertEditor({
  target,
  availableKnots,
  onChange,
  error,
}: {
  target: string;
  availableKnots: string[];
  onChange: (target: string) => void;
  error?: string;
}) {
  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">Divert Target</label>
      <select
        className={`content-item-editor__select ${error ? 'content-item-editor__input--error' : ''}`}
        value={target}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select target...</option>
        <option value="END">END</option>
        {availableKnots.map((knot) => (
          <option key={knot} value={knot}>
            {knot}
          </option>
        ))}
      </select>
      {error && <div className="content-item-editor__error">{error}</div>}
    </div>
  );
}

function RawEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (content: string) => void;
}) {
  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">Raw Ink Content</label>
      <textarea
        className="content-item-editor__input content-item-editor__textarea"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Raw ink syntax..."
        style={{ fontFamily: 'monospace' }}
      />
    </div>
  );
}

function StitchEditor({
  name,
  onChange,
  error,
}: {
  name: string;
  onChange: (name: string) => void;
  error?: string;
}) {
  // Sanitize name to valid ink identifier (alphanumeric + underscore)
  const handleChange = (value: string) => {
    // Convert to lowercase, replace spaces/invalid chars with underscore
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&'); // Can't start with number
    onChange(sanitized);
  };

  return (
    <div className="content-item-editor__field">
      <label className="content-item-editor__label">Stitch Name</label>
      <input
        className={`content-item-editor__input ${error ? 'content-item-editor__input--error' : ''}`}
        type="text"
        value={name}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="continue"
      />
      <div className="content-item-editor__hint">
        Used for internal navigation. Common names: continue, response, next
      </div>
      {error && <div className="content-item-editor__error">{error}</div>}
    </div>
  );
}

export default ContentItemEditor;
