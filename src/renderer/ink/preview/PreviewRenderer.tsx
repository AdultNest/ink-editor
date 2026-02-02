/**
 * PreviewRenderer Component
 *
 * Maps KnotContentItem array to preview components.
 * This is the main orchestrator for rendering knot content as chat preview.
 * Supports nested content inside choices and visual caret indicator.
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { KnotContentItem, ChoiceContentItem, StitchContentItem } from '../parser/inkTypes';
import { MediaValidator } from '../parser/mediaValidator';
import type { PreviewRendererProps } from './types';
import type { CaretPosition } from '../hooks/useCaretNavigation';

import { PreviewContainer } from './PreviewContainer';
import { MessageBubble } from './MessageBubble';
import { ImageMessage } from './ImageMessage';
import { VideoMessage } from './VideoMessage';
import { TypingIndicator } from './TypingIndicator';
import { ChoiceGroup } from './ChoiceGroup';
import { TransitionCard } from './TransitionCard';
import { SideStoryMarker } from './SideStoryMarker';
import { FlagOperationBadge } from './FlagOperationBadge';
import { DivertArrow } from './DivertArrow';
import { ConditionalBlock } from './ConditionalBlock';

import './Preview.css';

/**
 * Check if a divert target is a stitch reference (contains a dot)
 */
function isStitchDivert(target: string): boolean {
  return target.includes('.');
}

/**
 * Extract stitch name from a divert target (e.g., "knot.stitch" -> "stitch")
 */
function getStitchName(target: string): string | null {
  const parts = target.split('.');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Raw content fallback display
 */
function RawContent({
  content,
  onClick,
}: {
  content: string;
  onClick?: () => void;
}) {
  return (
    <div className="raw-content" onClick={onClick}>
      {content}
    </div>
  );
}

/**
 * Caret indicator component - shows where new content will be inserted
 */
function CaretIndicator({ isNested = false }: { isNested?: boolean }) {
  return (
    <div className={`caret-indicator ${isNested ? 'caret-indicator--nested' : ''}`}>
      <div className="caret-indicator__line" />
      <span className="caret-indicator__label">Insert here</span>
      <div className="caret-indicator__line" />
    </div>
  );
}

export function PreviewRenderer({
  items,
  projectPath,
  mode,
  onItemClick,
  onChoiceSelect,
  selectedItemId,
  caret,
}: PreviewRendererProps) {
  // Create media validator
  const validator = useMemo(
    () => new MediaValidator(projectPath),
    [projectPath]
  );

  // Track media validation results
  const [mediaValidation, setMediaValidation] = useState<Map<string, boolean>>(
    new Map()
  );

  // Track resolved filenames (base filename -> actual filename with extension)
  const [resolvedFiles, setResolvedFiles] = useState<Map<string, string>>(
    new Map()
  );

  // Resolve filenames and validate media files on mount and when items change
  useEffect(() => {
    // Skip if no project path
    if (!projectPath) return;

    const resolveAndValidateMedia = async () => {
      const newValidation = new Map<string, boolean>();
      const newResolved = new Map<string, string>();

      // Helper to process a single item
      const processItem = async (item: KnotContentItem) => {
        if (item.type === 'image' || item.type === 'player-image') {
          // Resolve the actual filename (find file with extension)
          const resolvedFilename = await validator.findImageFile(item.filename);
          newResolved.set(`image:${item.filename}`, resolvedFilename);
          const result = await validator.validateImage(resolvedFilename);
          newValidation.set(`image:${item.filename}`, result.exists);
        } else if (item.type === 'video' || item.type === 'player-video') {
          // Resolve the actual filename (find file with extension)
          const resolvedFilename = await validator.findVideoFile(item.filename);
          newResolved.set(`video:${item.filename}`, resolvedFilename);
          const result = await validator.validateVideo(resolvedFilename);
          newValidation.set(`video:${item.filename}`, result.exists);
        } else if (item.type === 'choice' && item.nestedContent) {
          // Process nested content inside choices
          for (const nestedItem of item.nestedContent) {
            await processItem(nestedItem);
          }
        }
      };

      for (const item of items) {
        await processItem(item);
      }

      setResolvedFiles(newResolved);
      setMediaValidation(newValidation);
    };

    resolveAndValidateMedia();
  }, [items, validator, projectPath]);

  // Check if caret should be shown at a specific position
  const shouldShowCaret = useCallback(
    (parentId: string | null, afterIndex: number): boolean => {
      if (mode !== 'edit' || !caret) return false;
      return caret.parentId === parentId && caret.afterIndex === afterIndex;
    },
    [mode, caret]
  );

  // Build a map of stitch names to their content items
  const stitchMap = useMemo(() => {
    const map = new Map<string, StitchContentItem>();
    for (const item of items) {
      if (item.type === 'stitch') {
        map.set(item.name, item);
      }
    }
    return map;
  }, [items]);

  // Check if a choice diverts to a stitch and get the stitch content
  const getStitchForChoice = useCallback((choice: ChoiceContentItem): StitchContentItem | null => {
    if (!choice.divert || !isStitchDivert(choice.divert)) {
      return null;
    }
    const stitchName = getStitchName(choice.divert);
    return stitchName ? stitchMap.get(stitchName) || null : null;
  }, [stitchMap]);

  // Group consecutive choices together (for root level display)
  // But preserve individual choices when they have nested content or divert to stitches
  // Also filter out standalone stitches (they're rendered as part of choices)
  const groupedItems = useMemo(() => {
    const result: Array<KnotContentItem | { type: 'choice-group'; choices: ChoiceContentItem[] }> = [];
    let currentChoices: ChoiceContentItem[] = [];

    const flushChoices = () => {
      if (currentChoices.length > 0) {
        // In edit mode, don't group choices - keep them individual so caret can appear between them
        // Also don't group if any choice has nested content or diverts to a stitch
        const hasNestedContent = currentChoices.some(
          (c) => (c.nestedContent && c.nestedContent.length > 0) || getStitchForChoice(c)
        );
        if (mode === 'edit' || hasNestedContent) {
          // Add each choice individually
          for (const choice of currentChoices) {
            result.push(choice);
          }
        } else {
          result.push({ type: 'choice-group', choices: currentChoices });
        }
        currentChoices = [];
      }
    };

    for (const item of items) {
      if (item.type === 'stitch') {
        // Stitch is just a marker - show in edit mode only
        // Content following stitch is already at root level as sibling items
        flushChoices();
        if (mode === 'edit') {
          result.push(item);
        }
        continue;
      }

      if (item.type === 'choice') {
        // If this choice has nested content or diverts to stitch, flush and add individually
        if ((item.nestedContent && item.nestedContent.length > 0) || getStitchForChoice(item)) {
          flushChoices();
          result.push(item);
        } else {
          currentChoices.push(item);
        }
      } else {
        flushChoices();
        result.push(item);
      }
    }

    flushChoices();
    return result;
  }, [items, getStitchForChoice, mode]);

  // Handle item click
  const handleItemClick = (item: KnotContentItem, index: number) => {
    if (mode !== 'playback') {
      onItemClick?.(item, index);
    }
  };

  // Render a single item
  const renderItem = (
    item: KnotContentItem | { type: 'choice-group'; choices: ChoiceContentItem[] },
    index: number
  ) => {
    // Handle choice group (grouped choices)
    if (item.type === 'choice-group') {
      const choices = item.choices.map((c) => ({
        text: c.text,
        isSticky: c.isSticky,
        divert: c.divert,
        label: c.label,
      }));

      return (
        <ChoiceGroup
          key={`choice-group-${index}`}
          choices={choices}
          onChoiceClick={(choiceIndex) => {
            if (mode === 'playback') {
              onChoiceSelect?.(choices[choiceIndex], choiceIndex);
            } else {
              // In edit mode, select the choice item
              const originalIndex = items.findIndex(
                (i) => i.id === item.choices[choiceIndex].id
              );
              onItemClick?.(item.choices[choiceIndex], originalIndex);
            }
          }}
          disabled={false}
        />
      );
    }

    // Find original index for click handling
    const originalIndex = items.findIndex((i) => i.id === item.id);

    switch (item.type) {
      case 'text':
        return (
          <MessageBubble
            key={item.id}
            content={item.content}
            isPlayer={false}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'image': {
        // Use resolved filename (with extension) if available
        const resolvedFilename = resolvedFiles.get(`image:${item.filename}`) || item.filename;
        const src = resolvedFilename
          ? validator.getLocalUrl(`${projectPath}/Images/${resolvedFilename}`)
          : '';
        return (
          <ImageMessage
            key={item.id}
            src={src}
            filename={item.filename}
            isPlayer={false}
            isValid={!!item.filename}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );
      }

      case 'player-image': {
        const resolvedFilename = resolvedFiles.get(`image:${item.filename}`) || item.filename;
        const src = resolvedFilename
          ? validator.getLocalUrl(`${projectPath}/Images/${resolvedFilename}`)
          : '';
        return (
          <ImageMessage
            key={item.id}
            src={src}
            filename={item.filename}
            isPlayer={true}
            isValid={!!item.filename}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );
      }

      case 'video': {
        const resolvedFilename = resolvedFiles.get(`video:${item.filename}`) || item.filename;
        const src = resolvedFilename
          ? validator.getLocalUrl(`${projectPath}/Videos/${resolvedFilename}`)
          : '';
        return (
          <VideoMessage
            key={item.id}
            src={src}
            filename={item.filename}
            isPlayer={false}
            isValid={!!item.filename}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );
      }

      case 'player-video': {
        const resolvedFilename = resolvedFiles.get(`video:${item.filename}`) || item.filename;
        const src = resolvedFilename
          ? validator.getLocalUrl(`${projectPath}/Videos/${resolvedFilename}`)
          : '';
        return (
          <VideoMessage
            key={item.id}
            src={src}
            filename={item.filename}
            isPlayer={true}
            isValid={!!item.filename}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );
      }

      case 'fake-type':
        return (
          <TypingIndicator
            key={item.id}
            duration={item.durationSeconds}
            animated={mode === 'playback' || mode === 'preview'}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'wait':
        return (
          <div
            key={item.id}
            className="wait-indicator"
            onClick={() => handleItemClick(item, originalIndex)}
          >
            <span className="wait-indicator__icon">⏸</span>
            <span className="wait-indicator__text">Wait {item.durationSeconds}s</span>
          </div>
        );

      case 'side-story':
        return (
          <SideStoryMarker
            key={item.id}
            storyName={item.storyName}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'transition':
        return (
          <TransitionCard
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'flag-operation':
        return (
          <FlagOperationBadge
            key={item.id}
            operation={item.operation}
            flagName={item.flagName}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'choice': {
        // Individual choice with potential nested content and/or stitch continuation
        const hasNested = item.nestedContent && item.nestedContent.length > 0;
        const stitchContinuation = getStitchForChoice(item);
        const hasContinuation = hasNested || stitchContinuation;

        // Determine what divert to show (hide stitch diverts since we show the content)
        const displayDivert = stitchContinuation ? undefined : item.divert;

        // Check if this is a dangling choice (no divert at all)
        const isDangling = !item.divert;

        return (
          <div key={item.id} className={`choice-with-nested ${isDangling ? 'choice-with-nested--dangling' : ''}`}>
            <ChoiceGroup
              choices={[
                {
                  text: item.text,
                  isSticky: item.isSticky,
                  divert: displayDivert,
                  label: item.label,
                  isDangling,
                },
              ]}
              onChoiceClick={() => handleItemClick(item, originalIndex)}
              disabled={false}
            />
            {/* Nested content */}
            {hasNested && (
              <div className="nested-content">
                {/* Caret at start of nested content */}
                {shouldShowCaret(item.id, -1) && <CaretIndicator isNested />}
                {item.nestedContent!.map((nestedItem, nestedIndex) => (
                  <div key={nestedItem.id}>
                    {renderItem(nestedItem, nestedIndex)}
                    {/* Caret after each nested item */}
                    {shouldShowCaret(item.id, nestedIndex) && <CaretIndicator isNested />}
                  </div>
                ))}
              </div>
            )}
            {/* Stitch divert indicator - shows the choice diverts to a stitch */}
            {stitchContinuation && (
              <div
                className={`stitch-continuation__marker ${mode === 'edit' ? 'stitch-continuation__marker--editable' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  // Clicking selects the choice to edit its divert
                  handleItemClick(item, originalIndex);
                }}
                title={mode === 'edit' ? 'Click to edit or remove stitch divert' : `Continues to stitch: ${stitchContinuation.name}`}
              >
                <span className="stitch-continuation__icon">↓</span>
                <span className="stitch-continuation__label">
                  → {item.divert}
                </span>
                {mode === 'edit' && (
                  <span className="stitch-continuation__edit-hint">(click to edit)</span>
                )}
              </div>
            )}
            {/* Show expand indicator if can have nested content but is empty */}
            {!hasContinuation && mode === 'edit' && caret?.parentId === item.id && (
              <div className="nested-content nested-content--empty">
                <CaretIndicator isNested />
                <span className="nested-content__hint">Add nested content here</span>
              </div>
            )}
          </div>
        );
      }

      case 'stitch':
        // Stitches are rendered as part of choices, not standalone
        // But show them in edit mode for visibility
        if (mode === 'edit') {
          // Render stitch header as a simple marker, content is rendered separately at root level
          return (
            <div
              key={item.id}
              className="stitch-marker"
              onClick={() => handleItemClick(item, originalIndex)}
            >
              <span className="stitch-marker__icon">=</span>
              <span className="stitch-marker__name">{item.name}</span>
            </div>
          );
        }
        // In preview/playback mode, stitches are hidden (rendered via choices)
        return null;

      case 'divert':
        return (
          <DivertArrow
            key={item.id}
            target={item.target}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'conditional':
        return (
          <ConditionalBlock
            key={item.id}
            branches={item.branches}
            projectPath={projectPath}
            mode={mode}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      case 'raw':
        return (
          <RawContent
            key={item.id}
            content={item.content}
            onClick={() => handleItemClick(item, originalIndex)}
          />
        );

      default:
        return null;
    }
  };

  // Empty state
  if (items.length === 0) {
    return (
      <PreviewContainer>
        <div className="preview-empty">
          <span className="preview-empty__icon">💬</span>
          <span className="preview-empty__text">No content yet</span>
          {/* Show caret in empty state if in edit mode */}
          {shouldShowCaret(null, -1) && <CaretIndicator />}
        </div>
      </PreviewContainer>
    );
  }

  // Wrap item in selection container if in edit mode
  const wrapWithSelection = (
    item: KnotContentItem | { type: 'choice-group'; choices: ChoiceContentItem[] },
    element: React.ReactNode
  ) => {
    if (mode !== 'edit') return element;

    // Determine if this item is selected
    let isSelected = false;
    if (item.type === 'choice-group') {
      // Check if any choice in the group is selected
      isSelected = item.choices.some((c) => c.id === selectedItemId);
    } else {
      isSelected = item.id === selectedItemId;
    }

    const key = item.type === 'choice-group'
      ? `selection-${item.choices[0]?.id || 'group'}`
      : `selection-${item.id}`;

    return (
      <div
        key={key}
        className={`preview-item-wrapper ${isSelected ? 'preview-item-wrapper--selected' : ''}`}
      >
        {element}
      </div>
    );
  };

  // Build the render list with caret indicators at appropriate positions
  const renderWithCaret = () => {
    const elements: React.ReactNode[] = [];

    // Caret at the very start (before first item)
    if (shouldShowCaret(null, -1)) {
      elements.push(<CaretIndicator key="caret-start" />);
    }

    // Map items to their original indices for root-level caret positioning
    let rootIndex = 0;
    for (let i = 0; i < groupedItems.length; i++) {
      const item = groupedItems[i];
      elements.push(wrapWithSelection(item, renderItem(item, i)));

      // Calculate the root index for caret positioning
      // For choice groups, we need to account for all choices in the group
      if (item.type === 'choice-group') {
        const lastChoiceIndex = rootIndex + item.choices.length - 1;
        // Show caret after the last choice in the group
        if (shouldShowCaret(null, lastChoiceIndex)) {
          elements.push(<CaretIndicator key={`caret-${lastChoiceIndex}`} />);
        }
        rootIndex += item.choices.length;
      } else {
        // Single item - show caret after it if appropriate
        const itemIndex = items.findIndex((it) => it.id === item.id);
        if (shouldShowCaret(null, itemIndex)) {
          elements.push(<CaretIndicator key={`caret-${itemIndex}`} />);
        }
        rootIndex++;
      }
    }

    return elements;
  };

  return (
    <PreviewContainer autoScroll={mode === 'playback'}>
      {renderWithCaret()}
    </PreviewContainer>
  );
}

export default PreviewRenderer;
