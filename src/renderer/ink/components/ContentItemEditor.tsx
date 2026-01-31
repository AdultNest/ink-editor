/**
 * ContentItemEditor Component
 *
 * Polymorphic editor for different content item types.
 */

import { useCallback, useState, useEffect } from 'react';
import type { KnotContentItem } from '../parser/inkTypes';
import { MediaValidator } from '../parser/mediaValidator';

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
  /** Available flag names for autocomplete */
  availableFlags: string[];
  /** Validation error message */
  error?: string;
}

export function ContentItemEditor({
  item,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  projectPath,
  availableKnots,
  availableFlags,
  error,
}: ContentItemEditorProps) {
  // Available media files
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [availableVideos, setAvailableVideos] = useState<string[]>([]);

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
  }, [projectPath]);

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
}: {
  filename: string;
  availableImages: string[];
  onChange: (filename: string) => void;
  isPlayer?: boolean;
  error?: string;
  projectPath: string;
}) {
  const [filterText, setFilterText] = useState('');

  const filteredImages = availableImages.filter((img) =>
    img.toLowerCase().includes(filterText.toLowerCase())
  );

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
  onChangeText,
  onChangeSticky,
  onChangeDivert,
  error,
}: {
  text: string;
  isSticky: boolean;
  divert?: string;
  availableKnots: string[];
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
          {availableKnots.map((knot) => (
            <option key={knot} value={knot}>
              {knot}
            </option>
          ))}
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

export default ContentItemEditor;
