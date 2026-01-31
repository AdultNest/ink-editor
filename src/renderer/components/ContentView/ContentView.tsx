/**
 * ContentView component
 *
 * Main content area that renders different views based on the active tab's file type.
 * - For .ink files: Shows the InkEditor (node tree editor)
 * - For image files: Shows the ImageViewer
 * - For video files: Shows the VideoViewer
 * - For audio files: Shows the AudioViewer
 * - For JSON files: Shows appropriate JSON editor based on context
 * - For text files: Shows the TextViewer
 * - When no tab is active: Shows a placeholder
 */

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { type TabData } from '../TabBar/types';
import { getFileExtension } from '../FileTree/types';
import TextViewer from './TextViewer';
import ImageViewer from './ImageViewer';
import VideoViewer from './VideoViewer';
import AudioViewer from './AudioViewer';
import JsonEditor from './JsonEditor';
import ModJsonEditor from './ModJsonEditor';
import CharacterJsonEditor from './CharacterJsonEditor';
import ConversationJsonEditor from './ConversationJsonEditor';
import MethodsConfigEditor from './MethodsConfigEditor';
import { InkEditor, type InkEditorHandle } from '../../ink';
import './ContentView.css';

export interface ContentViewProps {
  /** The currently active tab, or undefined if no tab is selected */
  activeTab: TabData | undefined;
  /** Callback when the active editor's dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

/** Handle exposed by ContentView for parent components */
export interface ContentViewHandle {
  /** Save the current editor's content */
  save: () => Promise<void>;
  /** Whether the current editor has unsaved changes */
  isDirty: boolean;
}

/** Image file extensions */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.tif',
]);

/** Video file extensions */
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v',
]);

/** Audio file extensions */
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.aac', '.oga', '.m4a', '.ogg',
]);

/**
 * Gets the file extension from a file path
 */
function getExtension(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  return getFileExtension(fileName);
}

/**
 * Gets the file name from a path
 */
function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || '';
}

/**
 * Checks if file is in a "characters" folder
 */
function isInCharactersFolder(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  return normalizedPath.includes('/characters/');
}

/**
 * Checks if file is in an "Injections" folder
 */
function isInInjectionsFolder(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  return normalizedPath.includes('/injections/');
}

/**
 * Gets the .ink neighbor path for a JSON file
 */
function getInkNeighborPath(jsonFilePath: string): string {
  // Replace .json extension with .ink
  return jsonFilePath.replace(/\.json$/i, '.ink');
}

/**
 * Determines the content type for a file
 */
type ContentType = 'ink' | 'image' | 'video' | 'audio' | 'json' | 'text';

function getContentType(filePath: string): ContentType {
  const extension = getExtension(filePath);

  if (extension === '.ink') {
    return 'ink';
  }
  if (extension === '.json') {
    return 'json';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  return 'text';
}

/**
 * JSON editor type
 */
type JsonEditorType = 'generic' | 'mod' | 'character' | 'conversation' | 'injection' | 'methods';

/**
 * Determines which JSON editor to use
 */
async function determineJsonEditorType(filePath: string): Promise<JsonEditorType> {
  const fileName = getFileName(filePath).toLowerCase();

  // Check for methods.conf.json
  if (fileName === 'methods.conf.json') {
    return 'methods';
  }

  // Check for mod.json
  if (fileName === 'mod.json') {
    return 'mod';
  }

  // Check for character files (in characters folder)
  if (isInCharactersFolder(filePath)) {
    return 'character';
  }

  // Check for conversation/injection files (has neighboring .ink file with same name)
  const inkPath = getInkNeighborPath(filePath);
  const inkExists = await window.electronAPI.fileExists(inkPath);
  if (inkExists) {
    // If in Injections folder, use injection format
    if (isInInjectionsFolder(filePath)) {
      return 'injection';
    }
    // Otherwise use regular conversation format
    return 'conversation';
  }

  return 'generic';
}

/**
 * ContentView renders the appropriate content based on the active tab
 */
export const ContentView = forwardRef<ContentViewHandle, ContentViewProps>(function ContentView(
  { activeTab, onDirtyChange },
  ref
) {
  const [jsonEditorType, setJsonEditorType] = useState<JsonEditorType>('generic');
  const [isCheckingJsonType, setIsCheckingJsonType] = useState(false);

  // Ref to the current editor's handle (for InkEditor)
  const inkEditorRef = useRef<InkEditorHandle>(null);

  // Track current dirty state
  const [isDirty, setIsDirty] = useState(false);

  // Handle dirty state changes from editors
  const handleDirtyChange = (dirty: boolean) => {
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  };

  // Expose save and isDirty to parent via ref
  useImperativeHandle(ref, () => ({
    save: async () => {
      if (inkEditorRef.current) {
        await inkEditorRef.current.save();
      }
      // TODO: Add save for other editor types when they support it
    },
    isDirty,
  }), [isDirty]);

  // Reset dirty state when tab changes
  useEffect(() => {
    setIsDirty(false);
  }, [activeTab?.filePath]);

  const filePath = activeTab?.filePath;

  // Determine JSON editor type when active tab changes
  useEffect(() => {
    if (!filePath) {
      setJsonEditorType('generic');
      setIsCheckingJsonType(false);
      return;
    }

    const contentType = getContentType(filePath);
    if (contentType !== 'json') {
      setJsonEditorType('generic');
      setIsCheckingJsonType(false);
      return;
    }

    let isCancelled = false;
    setIsCheckingJsonType(true);
    setJsonEditorType('generic'); // Reset while checking

    determineJsonEditorType(filePath).then((type) => {
      if (!isCancelled) {
        setJsonEditorType(type);
        setIsCheckingJsonType(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [filePath]);

  // No active tab - show placeholder
  if (!activeTab) {
    return (
      <div className="content-view content-view-placeholder">
        <span className="content-view-placeholder-icon">📄</span>
        <span className="content-view-placeholder-text">No file open</span>
        <span className="content-view-placeholder-hint">
          Double-click a file in the explorer to open it
        </span>
      </div>
    );
  }

  const contentType = getContentType(activeTab.filePath);

  switch (contentType) {
    case 'ink':
      return (
        <InkEditor
          ref={inkEditorRef}
          filePath={activeTab.filePath}
          fileName={activeTab.fileName}
          onDirtyChange={handleDirtyChange}
        />
      );

    case 'image':
      return (
        <ImageViewer
          filePath={activeTab.filePath}
          fileName={activeTab.fileName}
        />
      );

    case 'video':
      return (
        <VideoViewer
          filePath={activeTab.filePath}
          fileName={activeTab.fileName}
        />
      );

    case 'audio':
      return (
        <AudioViewer
          filePath={activeTab.filePath}
          fileName={activeTab.fileName}
        />
      );

    case 'json':
      if (isCheckingJsonType) {
        return (
          <div className="content-view content-view-loading">
            <div className="content-view-spinner" />
            <span>Loading...</span>
          </div>
        );
      }

      switch (jsonEditorType) {
        case 'methods':
          return (
            <MethodsConfigEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
            />
          );
        case 'mod':
          return (
            <ModJsonEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
            />
          );
        case 'character':
          return (
            <CharacterJsonEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
            />
          );
        case 'conversation':
          return (
            <ConversationJsonEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
              defaultFormat="conversation"
            />
          );
        case 'injection':
          return (
            <ConversationJsonEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
              defaultFormat="injection"
            />
          );
        default:
          return (
            <JsonEditor
              filePath={activeTab.filePath}
              fileName={activeTab.fileName}
            />
          );
      }

    case 'text':
    default:
      return (
        <TextViewer
          filePath={activeTab.filePath}
          fileName={activeTab.fileName}
        />
      );
  }
});

export default ContentView;
